/* Ecomexperts – popup + add-to-cart + auto-add rule (vanilla JS) */
(function () {
  'use strict';

  /* ---------- Helpers ---------- */

  function getActiveCurrency() {
    try {
      if (window && window.Shopify && window.Shopify.currency && window.Shopify.currency.active) {
        return window.Shopify.currency.active;
      }
    } catch (e) {}
    return 'USD';
  }

  function money(cents) {
    var currency = getActiveCurrency();
    try {
      return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: currency });
    } catch (e) {
      // very old browsers fallback
      return currency + ' ' + (cents / 100).toFixed(2);
    }
  }

  function getJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + url);
      return r.json();
    });
  }

  function productJson(handle) {
    return getJSON('/products/' + handle + '.js');
  }

  function addToCart(variantId, qty) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items: [{ id: variantId, quantity: qty || 1 }] })
    }).then(function (r) {
      if (!r.ok) throw new Error('Add to cart failed');
      return r.json();
    });
  }

  /* ---------- UI Builders ---------- */

  // Build selects for each product option using unique values from variants
  function buildOptionSelects(prod) {
    var wrap = document.createElement('div');
    wrap.className = 'ee-options';

    (prod.options || []).forEach(function (name, idx) {
      var label = document.createElement('label');
      label.textContent = name;

      var sel = document.createElement('select');
      sel.setAttribute('data-opt-index', String(idx));

      // collect unique values for this option index across all variants
      var seen = {};
      (prod.variants || []).forEach(function (v) {
        var val = v.options[idx];
        if (!seen[val]) {
          var o = document.createElement('option');
          o.value = val;
          o.textContent = val;
          sel.appendChild(o);
          seen[val] = true;
        }
      });

      wrap.appendChild(label);
      wrap.appendChild(sel);
    });

    return wrap;
  }

  function findVariant(prod, selects) {
    var chosen = selects.map(function (s) { return s.value; });
    for (var i = 0; i < prod.variants.length; i++) {
      var v = prod.variants[i];
      var ok = true;
      for (var j = 0; j < v.options.length; j++) {
        if (v.options[j] !== chosen[j]) { ok = false; break; }
      }
      if (ok) return v;
    }
    return null;
  }

  function renderModal(modal, prod) {
    var content = modal.querySelector('[data-ee-modal-content]');
    content.innerHTML = '';

    var title = document.createElement('h3');
    title.textContent = prod.title || '';
    content.appendChild(title);

    var priceEl = document.createElement('div');
    priceEl.className = 'ee-price';
    var initialVariant = (prod.variants && prod.variants[0]) ? prod.variants[0] : null;
    priceEl.textContent = initialVariant ? money(initialVariant.price) : '';
    content.appendChild(priceEl);

    if (prod.description) {
      var desc = document.createElement('p');
      desc.className = 'ee-desc';
      desc.textContent = prod.description.replace(/<[^>]*>/g, '').slice(0, 160);
      content.appendChild(desc);
    }

    var optsWrap = buildOptionSelects(prod);
    content.appendChild(optsWrap);

    var addBtn = document.createElement('button');
    addBtn.className = 'ee-add';
    addBtn.type = 'button';
    addBtn.textContent = 'ADD TO CART';
    content.appendChild(addBtn);

    var selects = Array.prototype.slice.call(optsWrap.querySelectorAll('select'));

    function refresh() {
      var v = findVariant(prod, selects);
      if (v) {
        priceEl.textContent = money(v.price);
        addBtn.disabled = !v.available;
      } else {
        priceEl.textContent = 'Unavailable';
        addBtn.disabled = true;
      }
    }

    selects.forEach(function (s) { s.addEventListener('change', refresh); });
    refresh();

    addBtn.addEventListener('click', function () {
      var v = findVariant(prod, selects);
      if (!v) return;
      addBtn.disabled = true;
      addToCart(v.id, 1)
        .then(function () {
          return maybeAutoAdd(prod, v, modal.closest('.ee-grid.page-width'));
        })
        .catch(function (e) { console.warn(e); })
        .finally(function () {
          addBtn.disabled = false;
          if (typeof modal.close === 'function') modal.close();
          else modal.setAttribute('hidden', '');
        });
    });
  }

  /* ---------- Business Rule: Auto-add ---------- */

  // If color == Black AND size == Medium, auto-add upsell product defined on section
  function maybeAutoAdd(prod, variant, gridSectionEl) {
    try {
      if (!prod || !variant || !gridSectionEl) return Promise.resolve();

      var colorIdx = -1, sizeIdx = -1;
      for (var i = 0; i < prod.options.length; i++) {
        var n = prod.options[i];
        if (/color/i.test(n)) colorIdx = i;
        if (/size/i.test(n)) sizeIdx = i;
      }

      var isBlack = colorIdx >= 0 && variant.options[colorIdx] && variant.options[colorIdx].toLowerCase() === 'black';
      var isMedium = sizeIdx >= 0 && variant.options[sizeIdx] && variant.options[sizeIdx].toLowerCase() === 'medium';
      if (!(isBlack && isMedium)) return Promise.resolve();

      var upsellHandle = gridSectionEl.getAttribute('data-upsell-handle');
      if (!upsellHandle) return Promise.resolve();

      return productJson(upsellHandle).then(function (upsell) {
        var upsellVariant = null;
        for (var j = 0; j < upsell.variants.length; j++) {
          if (upsell.variants[j].available) { upsellVariant = upsell.variants[j]; break; }
        }
        if (!upsellVariant) upsellVariant = upsell.variants[0];
        if (!upsellVariant) return;
        return addToCart(upsellVariant.id, 1);
      });
    } catch (e) {
      console.warn('Auto-add skipped:', e && e.message ? e.message : e);
      return Promise.resolve();
    }
  }

  /* ---------- Section Mount ---------- */

  function ensureDialog(modal) {
    if (!modal) return;
    // Tiny polyfill-ish fallback for older browsers
    if (!HTMLDialogElement || !HTMLDialogElement.prototype || !HTMLDialogElement.prototype.showModal) {
      modal.showModal = function () { modal.removeAttribute('hidden'); };
      modal.close = function () { modal.setAttribute('hidden', ''); };
    }
  }

  function mountGridSection(sectionEl) {
    if (!sectionEl) return;
    var modal = sectionEl.querySelector('[data-ee-modal]');
    ensureDialog(modal);

    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal && typeof modal.close === 'function') modal.close();
      });
    }

    var triggers = sectionEl.querySelectorAll('[data-ee-quickview]');
    for (var i = 0; i < triggers.length; i++) {
      triggers[i].addEventListener('click', function (ev) {
        var card = ev.currentTarget.closest('[data-product-handle]');
        var handle = card ? card.getAttribute('data-product-handle') : null;
        if (!handle || !modal) return;

        productJson(handle)
          .then(function (prod) {
            renderModal(modal, prod);
            if (typeof modal.showModal === 'function') modal.showModal();
            else modal.removeAttribute('hidden');
          })
          .catch(function (e) { console.warn('Quick view failed:', e); });
      });
    }
  }

  /* ---------- Boot ---------- */

  function init() {
    var sections = document.querySelectorAll('.ee-grid.page-width');
    for (var i = 0; i < sections.length; i++) mountGridSection(sections[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
