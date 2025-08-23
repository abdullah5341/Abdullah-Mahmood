/* EE Quick View bootstrap — works in Theme Editor too */
(function () {
  // Reusable helpers
  const $ = (sel, root = document) => root.querySelector(sel);

  const modal = document.querySelector('[data-modal]');
  const mediaEl = $('[data-media]', modal);
  const titleEl = $('[data-title]', modal);
  const priceEl = $('[data-price]', modal);
  const descEl  = $('[data-desc]', modal);
  const colorWrap = $('[data-color-wrap]', modal);
  const colorBox  = $('[data-color]', modal);
  const sizeWrap  = $('[data-size-wrap]', modal);
  const sizeSel   = $('[data-size]', modal);
  const statusEl  = $('[data-status]', modal);
  const addBtn    = $('[data-add]', modal);

  let currentData = null;
  let selected = { color: null, size: null, variantId: null };

  function openModalWith(data) {
    currentData = data;

    // Media
    const img = data.images && data.images[0];
    if (img) {
      mediaEl.src = img;
      mediaEl.width = 120;  // explicit for theme-check
      mediaEl.height = 120;
    } else {
      mediaEl.removeAttribute('src');
    }

    // Text
    titleEl.textContent = data.title || '';
    priceEl.textContent = data.price_formatted || '';
    descEl.textContent  = data.description || '';

    // Options
    const colorOpt = (data.options || []).find(o => /color/i.test(o.name));
    const sizeOpt  = (data.options || []).find(o => /size/i.test(o.name));

    // Colors as buttons
    colorBox.innerHTML = '';
    if (colorOpt && colorOpt.values && colorOpt.values.length) {
      colorWrap.hidden = false;
      colorOpt.values.forEach((val, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = val;
        btn.dataset.value = val;
        btn.setAttribute('data-active', idx === 0 ? 'true' : 'false');
        btn.addEventListener('click', () => {
          [...colorBox.children].forEach(b => b.dataset.active = 'false');
          btn.dataset.active = 'true';
          selected.color = val;
          resolveVariant();
        });
        colorBox.appendChild(btn);
      });
      selected.color = colorOpt.values[0];
    } else {
      colorWrap.hidden = true;
      selected.color = null;
    }

    // Sizes as select
    sizeSel.innerHTML = '';
    if (sizeOpt && sizeOpt.values && sizeOpt.values.length) {
      sizeWrap.hidden = false;
      sizeOpt.values.forEach((val, idx) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = val;
        if (idx === 0) opt.selected = true;
        sizeSel.appendChild(opt);
      });
      selected.size = sizeOpt.values[0];
    } else {
      sizeWrap.hidden = true;
      selected.size = null;
    }

    resolveVariant();
    statusEl.textContent = '';
    modal.hidden = false;
  }

  function closeModal() {
    modal.hidden = true;
    currentData = null;
    selected = { color: null, size: null, variantId: null };
  }

  function resolveVariant() {
    if (!currentData) return;
    // Try to match by options (order-insensitive)
    const wanted = [selected.color, selected.size].filter(Boolean).map(String.toLowerCase);
    let match = currentData.variants && currentData.variants[0];

    if (currentData.variants && currentData.variants.length) {
      for (const v of currentData.variants) {
        const vo = (v.options || []).map(o => String(o).toLowerCase());
        const ok = wanted.every(w => vo.includes(w));
        if (ok) { match = v; break; }
      }
    }
    selected.variantId = match ? match.id : null;
  }

  async function addToCart() {
    if (!selected.variantId) {
      statusEl.textContent = 'Please choose options';
      return;
    }

    // Build payload
    const items = [{ id: selected.variantId, quantity: 1 }];

    // Auto-add bonus (Color=Black & Size=M) if configured via section settings
    try {
      const grid = document.querySelector('.ee-grid');
      const ruleColor = grid?.dataset.bonusColor;
      const ruleSize  = grid?.dataset.bonusSize;
      const bonusId   = grid?.dataset.bonusVariant;

      if (bonusId && ruleColor && ruleSize) {
        const c = (selected.color || '').toLowerCase();
        const s = (selected.size  || '').toLowerCase();
        if (c === ruleColor.toLowerCase() && s === ruleSize.toLowerCase()) {
          items.push({ id: Number(bonusId), quantity: 1 });
        }
      }
    } catch (_) {}

    statusEl.textContent = 'Adding…';

    const res = await fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ items })
    }).then(r => r.json()).catch(() => null);

    statusEl.textContent = res ? 'Added to cart' : 'Could not add to cart';
  }

  // Event delegation: works after re-renders
  function bindDelegates(root = document) {
    // open
    root.addEventListener('click', (ev) => {
      const trigger = ev.target.closest('[data-open-quick]');
      if (!trigger) return;
      ev.preventDefault();
      const id = trigger.getAttribute('data-block-id');
      const jsonEl = document.getElementById('ee-product-json-' + id);
      if (!jsonEl) return;
      const data = JSON.parse(jsonEl.textContent);
      openModalWith(data);
    }, { passive: false });

    // close
    root.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    addBtn?.addEventListener('click', addToCart);
    modal?.addEventListener('click', (e) => {
      if (e.target.matches('[data-close], .ee-modal__backdrop')) closeModal();
    });

    // Size change
    sizeSel?.addEventListener('change', (e) => {
      selected.size = e.target.value;
      resolveVariant();
    });
  }

  // Init now and on Theme Editor section reloads
  document.addEventListener('DOMContentLoaded', () => bindDelegates(document));
  document.addEventListener('shopify:section:load', (e) => bindDelegates(e.target));
  document.addEventListener('shopify:section:unload', () => { /* no-op */ });
})();
