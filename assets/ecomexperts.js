/* ===== EE Quick-View: open from image or + button, no jQuery ===== */
(function(){
  const root = document;
  const modal = root.querySelector('[data-modal]');
  if(!modal) return;

  const dlg = modal.querySelector('.ee-modal__dialog');
  const back = modal.querySelector('[data-close]');
  const mediaEl = modal.querySelector('[data-media]');
  const titleEl = modal.querySelector('[data-title]');
  const priceEl = modal.querySelector('[data-price]');
  const descEl  = modal.querySelector('[data-desc]');
  const colorWrap = modal.querySelector('[data-color-wrap]');
  const colorBox  = modal.querySelector('[data-color]');
  const sizeWrap  = modal.querySelector('[data-size-wrap]');
  const sizeSel   = modal.querySelector('[data-size]');
  const addBtn    = modal.querySelector('[data-add]');
  const statusEl  = modal.querySelector('[data-status]');

  let current = null;   // hydrated product json
  let chosen = { };     // color, size

  // Read section-level bonus rule from DOM (rendered in schema settings via data attributes if you prefer)
  // Here we will extract them from theme editor globals rendered into the modal’s dataset (optional).
  const section = modal.closest('section.ee-grid');
  const bonusHandle = section?.dataset?.bonusHandle || null; // not required if you already add by ID
  const bonusRuleColor = (section?.dataset?.bonusColor || 'Black').toLowerCase();
  const bonusRuleSize  = (section?.dataset?.bonusSize || 'M').toLowerCase();
  const bonusProductId = section?.dataset?.bonusProductId || null; // we’ll use this when available

  function openForBlock(blockId){
    // pull product json
    const jsonEl = root.getElementById(`ee-product-json-${blockId}`);
    if(!jsonEl) return;
    current = JSON.parse(jsonEl.textContent);

    // hydrate UI
    mediaEl.src = current.images?.[0] || '';
    titleEl.textContent = current.title;
    priceEl.textContent = current.price_formatted;
    descEl.textContent  = current.description || '';

    // options
    const optColor = (current.options || []).find(o => o.name.toLowerCase() === 'color');
    const optSize  = (current.options || []).find(o => o.name.toLowerCase() === 'size');

    // colors -> two boxes like the design (but supports >2 as well)
    colorBox.innerHTML = '';
    if(optColor && optColor.values.length){
      colorWrap.hidden = false;
      optColor.values.forEach((v,i)=>{
        const b = root.createElement('button');
        b.type = 'button';
        b.textContent = v.value || v;
        b.dataset.value = v.value || v;
        b.addEventListener('click', ()=>{
          [...colorBox.children].forEach(x=>x.removeAttribute('data-active'));
          b.setAttribute('data-active','true');
          chosen.color = b.dataset.value;
        });
        if(i===0){ b.setAttribute('data-active','true'); chosen.color = b.value || b.dataset.value; }
        colorBox.appendChild(b);
      });
    }else{
      colorWrap.hidden = true;
      chosen.color = undefined;
    }

    // sizes
    sizeSel.innerHTML = '';
    if(optSize && optSize.values.length){
      sizeWrap.hidden = false;
      const ph = root.createElement('option');
      ph.value = ''; ph.textContent = 'Choose your size'; sizeSel.appendChild(ph);
      optSize.values.forEach(v=>{
        const o = root.createElement('option');
        const val = v.value || v;
        o.value = val; o.textContent = val;
        sizeSel.appendChild(o);
      });
      sizeSel.onchange = ()=>{ chosen.size = sizeSel.value || undefined; };
    }else{
      sizeWrap.hidden = true;
      chosen.size = undefined;
    }

    // reset status
    statusEl.textContent = '';
    addBtn.disabled = false;

    // show
    modal.hidden = false;
    root.body.style.overflow = 'hidden';
  }

  function close(){
    modal.hidden = true;
    root.body.style.overflow = '';
  }

  // open handlers (image and +)
  root.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-open-quick]');
    if(!btn) return;
    e.preventDefault();
    const id = btn.getAttribute('data-block-id');
    if(id) openForBlock(id);
  });

  // close handlers
  modal.addEventListener('click', (e)=>{
    if(e.target.hasAttribute('data-close') || e.target === modal) close();
  });
  root.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !modal.hidden) close(); });

  // Add to cart (with Black+M rule auto-add)
  async function addToCart(variantId, qty){
    const r = await fetch('/cart/add.js', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id: variantId, quantity: qty })
    });
    if(!r.ok) throw new Error('Add to cart failed');
    return r.json();
  }

  function findVariantId(){
    if(!current) return null;
    // match variant by chosen options if they exist
    for(const v of current.variants){
      let ok = true;
      const names = (current.options || []).map(o=>o.name.toLowerCase());
      if(chosen.color){
        const idx = names.indexOf('color');
        if(idx>-1 && (v.options[idx]||'').toLowerCase() !== chosen.color.toLowerCase()) ok=false;
      }
      if(chosen.size){
        const idx = names.indexOf('size');
        if(idx>-1 && (v.options[idx]||'').toLowerCase() !== chosen.size.toLowerCase()) ok=false;
      }
      if(ok && v.available) return v.id;
    }
    // fallback first available
    const first = current.variants.find(v=>v.available);
    return first ? first.id : null;
  }

  addBtn.addEventListener('click', async ()=>{
    try{
      addBtn.disabled = true;
      statusEl.textContent = 'Adding…';

      const mainId = findVariantId();
      if(!mainId) throw new Error('No available variant');

      await addToCart(mainId, 1);

      // bonus rule: Color=Black AND Size=M ⇒ add bonus product if configured
      const colorHit = (chosen.color||'').toLowerCase() === bonusRuleColor;
      const sizeHit  = (chosen.size ||'').toLowerCase() === bonusRuleSize;

      if(colorHit && sizeHit && bonusProductId){
        try{ await addToCart(Number(bonusProductId), 1); }catch(_e){}
      }

      statusEl.textContent = 'Added!';
      setTimeout(close, 600);
    }catch(err){
      console.error(err);
      statusEl.textContent = 'Sorry, could not add to cart.';
      addBtn.disabled = false;
    }
  });
})();
