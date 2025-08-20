(function(){
  const root = document.currentScript?.closest('[id^="ee-grid-"]') || document;
  const modal = root.querySelector('[data-modal]');
  if(!modal) return;

  const els = {
    image: modal.querySelector('[data-media]'),
    title: modal.querySelector('[data-title]'),
    price: modal.querySelector('[data-price]'),
    desc: modal.querySelector('[data-desc]'),
    colorWrap: modal.querySelector('[data-color-wrap]'),
    color: modal.querySelector('[data-color]'),
    sizeWrap: modal.querySelector('[data-size-wrap]'),
    size: modal.querySelector('[data-size]'),
    add: modal.querySelector('[data-add]'),
    status: modal.querySelector('[data-status]')
  };

  let product = null;
  let selection = {}; // { Color: 'Black', Size: 'M', ... }
  let variants = [];

  // Helpers
  const money = (cents) => {
    try { return new Intl.NumberFormat(undefined, { style:'currency', currency: Shopify.currency.active }).format(cents/100); }
    catch { return (cents/100).toFixed(2); }
  };
  const norm = s => (s||"").toString().trim().toLowerCase();

  function findVariant(){
    if(!variants.length) return null;
    // Compare each variant options against selection (by option order)
    return variants.find(v => {
      return v.options.every((val, i) => {
        const optName = (product.options[i] && product.options[i].name) || "";
        const sel = selection[optName] || selection[`option${i+1}`];
        return norm(val) === norm(sel);
      });
    }) || null;
  }

  function renderOptions(){
    // Clear
    els.color.innerHTML = '';
    els.size.innerHTML = '';
    els.colorWrap.hidden = true;
    els.sizeWrap.hidden = true;

    // Figma-style: treat "Color" as buttons, "Size" as select; others become selects.
    const options = product.options || [];

    options.forEach((opt, idx) => {
      const values = [...new Set(opt.values)];
      const optName = opt.name;

      if (norm(optName) === 'color') {
        els.colorWrap.hidden = false;
        values.forEach(val => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.innerHTML = `<span>${val}</span>`;
          btn.dataset.value = val;
          btn.addEventListener('click', () => {
            selection[optName] = val;
            // mark active
            [...els.color.children].forEach(b => b.dataset.active = (b.dataset.value === val) ? 'true' : 'false');
          });
          els.color.appendChild(btn);
        });
        // preselect
        selection[optName] = selection[optName] || values[0];
        // mark active
        [...els.color.children].forEach(b => b.dataset.active = (b.dataset.value === selection[optName]) ? 'true' : 'false');
      } else if (norm(optName) === 'size') {
        els.sizeWrap.hidden = false;
        const sel = els.size;
        sel.innerHTML = '';
        values.forEach(v => {
          const o = document.createElement('option');
          o.value = v; o.textContent = v;
          sel.appendChild(o);
        });
        selection[optName] = selection[optName] || values[0];
        sel.value = selection[optName];
        sel.addEventListener('change', () => (selection[optName] = sel.value));
      } else {
        // Generic select (rare here, but future-proof)
        const wrap = document.createElement('div');
        wrap.className = 'ee-field';
        wrap.innerHTML = `<label class="ee-field__label">${optName}</label>
          <div class="ee-size"><div class="ee-size__select">
            <select data-generic="${optName}"></select><span class="ee-caret"></span>
          </div></div>`;
        modal.querySelector('.ee-modal__info').insertBefore(wrap, els.add);

        const sel = wrap.querySelector('select');
        values.forEach(v => {
          const o = document.createElement('option');
          o.value = v; o.textContent = v; sel.appendChild(o);
        });
        selection[optName] = selection[optName] || values[0];
        sel.value = selection[optName];
        sel.addEventListener('change', () => (selection[optName] = sel.value));
      }
    });
  }

  function populateFromBlock(blockId){
    const jsonTag = root.querySelector('#ee-product-json-' + blockId);
    if(!jsonTag) return;
    const data = JSON.parse(jsonTag.textContent);

    product = {
      id: data.id,
      title: data.title,
      handle: data.handle,
      url: data.url,
      description: data.description,
      price: data.price,
      options: data.options || [],
      images: data.images || []
    };
    variants = data.variants || [];
    selection = {};

    // Media, title, price, desc
    els.image.src = product.images[0] || '';
    els.title.textContent = product.title;
    els.price.textContent = data.price_formatted || money(product.price);
    els.desc.textContent = product.description || '';

    // Render options
    renderOptions();
  }

  // Open/Close
  function open(blockId){
    populateFromBlock(blockId);
    modal.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    els.status.textContent = '';
  }
  function close(){
    modal.hidden = true;
    document.documentElement.style.overflow = '';
    els.status.textContent = '';
    // cleanup generic selects we injected
    modal.querySelectorAll('[data-generic]').forEach(n => {
      const field = n.closest('.ee-field'); field?.remove();
    });
  }
  modal.addEventListener('click', e => {
    if (e.target.matches('[data-close], .ee-modal__backdrop')) close();
  });
  document.addEventListener('keydown', e => { if(!modal.hidden && e.key === 'Escape') close(); });

  // Hotspot triggers
  root.addEventListener('click', e => {
    const btn = e.target.closest('[data-open-quick]');
    if(!btn) return;
    e.preventDefault();
    open(btn.dataset.blockId);
  });

  // Add to cart (with optional bonus rule)
  async function addToCart(variantId, qty=1){
    const r = await fetch('/cart/add.js', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: variantId, quantity: qty })
    });
    if(!r.ok) throw new Error('Add failed');
    return r.json();
  }

  async function maybeAddBonus() {
    const cfgEl = root.closest('section.ee-grid-section');
    if(!cfgEl) return;
    // Pull section settings from DOM dataset (not exposed by Liquid automatically),
    // so we’ll embed hidden inputs for rules:
  }

  // Embed bonus settings into DOM via data-* from Liquid:
  (function attachRules(){
    const section = root.querySelector(':scope');
    if(!section) return;
    section.dataset.bonusHandle = {{ section.settings.bonus_product | default: nil | json | replace: '"', '\"' | replace: 'null', '""' }};
    section.dataset.bonusColor = {{ section.settings.bonus_rule_color | json }};
    section.dataset.bonusSize  = {{ section.settings.bonus_rule_size  | json }};
  })();

  async function maybeAutoAddBonus(currentSelection){
    const section = root.querySelector(':scope');
    const handle = (section?.dataset.bonusHandle || '').trim();
    if(!handle) return;

    const wantColor = (section.dataset.bonusColor || '').toLowerCase();
    const wantSize  = (section.dataset.bonusSize  || '').toLowerCase();

    const selColor = (currentSelection['Color'] || '').toLowerCase();
    const selSize  = (currentSelection['Size']  || '').toLowerCase();

    if(selColor !== wantColor || selSize !== wantSize) return;

    // Liquid-embed the bonus product JSON so we don't fetch:
    {% if section.settings.bonus_product %}
      const bonus = {
        id: {{ section.settings.bonus_product.id }},
        variants: [{% for v in section.settings.bonus_product.variants %}
          {"id": {{ v.id }}, "title": {{ v.title | json }}, "available": {{ v.available | json }}}{% unless forloop.last %},{% endunless %}
        {% endfor %}]
      };
      // Add the first available variant
      const firstAvail = bonus.variants.find(v => v.available) || bonus.variants[0];
      if(firstAvail) {
        try { await addToCart(firstAvail.id, 1); } catch(e){}
      }
    {% endif %}
  }

  // Click “ADD TO CART”
  els.add.addEventListener('click', async () => {
    const v = findVariant();
    if(!v) { els.status.textContent = 'Please select options'; return; }
    if(!v.available){ els.status.textContent = 'Selected variant is sold out'; return; }

    els.add.disabled = true; els.status.textContent = 'Adding…';
    try {
      await addToCart(v.id, 1);
      await maybeAutoAddBonus(selection);
      els.status.textContent = 'Added to cart ✓';
    } catch(e){
      els.status.textContent = 'Something went wrong';
    } finally {
      els.add.disabled = false;
    }
  });
})();
