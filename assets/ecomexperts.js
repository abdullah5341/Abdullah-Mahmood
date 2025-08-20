/* ===================================================================
   Ecomexperts – Quick View modal logic (no jQuery)
=================================================================== */
(function () {
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));

  const modal = $('.ee-modal');
  if (!modal) return;

  const dialog = $('.ee-modal__dialog', modal);
  const imgEl  = $('.ee-modal__img', modal);
  const nameEl = $('.ee-name', modal);
  const priceEl= $('.ee-price', modal);
  const descEl = $('.ee-desc', modal);
  const colorWrap = $('[data-color-wrap]', modal);
  const colorBox  = $('.ee-color', modal);
  const sizeWrap  = $('[data-size-wrap]', modal);
  const sizeBtn   = $('.ee-size__select', modal);
  const sizeText  = $('.ee-size__text', modal);
  const sizeMenu  = $('.ee-size__menu', modal);
  const addBtn    = $('[data-add]', modal);

  // Handle for the product that should be auto-added for Black + Medium
  const BONUS_HANDLE = 'soft-winter-jacket';  // change if your handle differs

  let productData = null;           // /products/{handle}.js
  let selectedColor = null;
  let selectedSize  = null;

  function openModal() {
    modal.classList.add('is-open');
    document.documentElement.classList.add('ee-lock');
    sizeMenu.classList.remove('is-open');
    sizeBtn.setAttribute('aria-expanded', 'false');
  }
  function closeModal() {
    modal.classList.remove('is-open');
    document.documentElement.classList.remove('ee-lock');
    productData = null;
    selectedColor = selectedSize = null;
    addBtn.disabled = true;
    colorBox.innerHTML = '';
    sizeMenu.innerHTML = '';
    sizeText.textContent = 'Choose your size';
  }

  modal.addEventListener('click', (e)=>{
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  // Toggle size dropdown
  sizeBtn.addEventListener('click', ()=>{
    const open = sizeMenu.classList.toggle('is-open');
    sizeBtn.setAttribute('aria-expanded', String(open));
  });

  // Hotspots
  $$('.ee-card .ee-hotspot').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const card = btn.closest('.ee-card');
      const handle = card.getAttribute('data-handle');

      // Prefill from card
      imgEl.src = card.getAttribute('data-featured');
      imgEl.alt = card.getAttribute('data-title');
      nameEl.textContent = card.getAttribute('data-title');
      priceEl.textContent = card.getAttribute('data-price');
      descEl.textContent  = card.getAttribute('data-desc');

      // Fetch full product JSON for options/variants
      try{
        const res = await fetch(`/products/${handle}.js`);
        productData = await res.json();
      }catch(err){
        console.error('Failed to fetch product JSON', err);
        return openModal();
      }

      // Render Color pills (supports option name "Color")
      const colorOpt = productData.options.find(o => /color/i.test(o.name));
      if (colorOpt && colorOpt.values && colorOpt.values.length){
        colorWrap.hidden = false;
        colorBox.innerHTML = '';
        // Figma shows 2 pills; we’ll render all, but keep same style
        colorOpt.values.forEach((val, i)=>{
          const sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'ee-swatch';
          sw.setAttribute('data-color', val);

          const box = document.createElement('span');
          box.className = 'ee-swatch__box';
          // simple color fill when recognizable:
          const cssColor = val.toLowerCase();
          if (['black','white','red','blue','grey','gray','green'].includes(cssColor)){
            box.style.background = cssColor === 'grey' ? 'gray' : cssColor;
          }
          const label = document.createElement('span');
          label.className = 'ee-swatch__name';
          label.textContent = val;

          sw.append(box, label);
          colorBox.append(sw);

          sw.addEventListener('click', ()=>{
            selectedColor = val;
            $$('.ee-swatch', colorBox).forEach(s=>s.classList.remove('is-active'));
            sw.classList.add('is-active');
            syncAddState();
          });
        });
      }else{
        colorWrap.hidden = true;
        selectedColor = null;
      }

      // Render Size list (supports option name "Size")
      const sizeOpt = productData.options.find(o => /size/i.test(o.name));
      if (sizeOpt && sizeOpt.values && sizeOpt.values.length){
        sizeWrap.hidden = false;
        sizeMenu.innerHTML = '';
        sizeOpt.values.forEach(val=>{
          const opt = document.createElement('button');
          opt.type = 'button';
          opt.className = 'ee-size__opt';
          opt.textContent = val;
          opt.addEventListener('click', ()=>{
            selectedSize = val;
            sizeText.textContent = val;
            $$('.ee-size__opt', sizeMenu).forEach(o=>o.classList.remove('is-active'));
            opt.classList.add('is-active');
            sizeMenu.classList.remove('is-open');
            sizeBtn.setAttribute('aria-expanded','false');
            syncAddState();
          });
          sizeMenu.append(opt);
        });
      }else{
        sizeWrap.hidden = true;
        selectedSize = null;
      }

      openModal();
      syncAddState();
    });
  });

  function syncAddState(){
    // enable button if we can resolve a variant with current selections
    if (!productData) { addBtn.disabled = true; return; }
    const variant = resolveVariant();
    addBtn.disabled = !variant;
  }

  function resolveVariant(){
    // Matches variant by options. Works whether product has Color/Size or different names.
    return productData.variants.find(v=>{
      let ok = true;
      if (selectedColor){
        ok = ok && [v.option1, v.option2, v.option3].some(o => (o||'').toLowerCase() === selectedColor.toLowerCase());
      }
      if (selectedSize){
        ok = ok && [v.option1, v.option2, v.option3].some(o => (o||'').toLowerCase() === selectedSize.toLowerCase());
      }
      return ok;
    }) || null;
  }

  async function addToCart(variantId, qty=1){
    const res = await fetch('/cart/add.js', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty })
    });
    if (!res.ok) throw new Error('add.js failed');
    return res.json();
  }

  async function addBonusIfNeeded(){
    if (!(selectedColor && selectedSize)) return;
    if (selectedColor.toLowerCase() !== 'black') return;
    if (selectedSize.toLowerCase() !== 'm') return;

    try{
      const res = await fetch(`/products/${BONUS_HANDLE}.js`);
      const bonus = await res.json();
      const firstAvailable = bonus.variants.find(v => v.available) || bonus.variants[0];
      if (firstAvailable) await addToCart(firstAvailable.id, 1);
    }catch(e){
      console.warn('Bonus add failed', e);
    }
  }

  addBtn.addEventListener('click', async ()=>{
    const variant = resolveVariant() || (productData?.variants?.[0] || null);
    if (!variant) return;

    addBtn.disabled = true;
    try{
      await addToCart(variant.id, 1);
      await addBonusIfNeeded();
      closeModal();
      // optional: open drawer or toast
    }catch(e){
      console.error(e);
      addBtn.disabled = false;
    }
  });
})();
