/* ===== EE Quick-View (editor-safe) — no jQuery ===== */
(function(){
  const root = document;

  function initOnce(scope){
    // find the first modal inside the given scope (or document)
    const host = scope || root;
    const modal = host.querySelector('[data-modal]');
    if(!modal || modal.__eeBound) return;   // already wired or not present

    modal.__eeBound = true;

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

    const section = modal.closest('section.ee-grid');
    const bonusRuleColor = (section?.dataset?.bonusColor || 'Black').toLowerCase();
    const bonusRuleSize  = (section?.dataset?.bonusSize  || 'M').toLowerCase();
    const bonusProductId = section?.dataset?.bonusProductId || null;

    let current = null;
    let chosen  = {};

    function openForBlock(blockId){
      const jsonEl = root.getElementById(`ee-product-json-${blockId}`);
      if(!jsonEl) return;
      current = JSON.parse(jsonEl.textContent);

      mediaEl.src = current.images?.[0] || '';
      titleEl.textContent = current.title || '';
      priceEl.textContent = current.price_formatted || '';
      descEl.textContent  = current.description || '';

      const optColor = (current.options || []).find(o => o.name?.toLowerCase() === 'color');
      const optSize  = (current.options || []).find(o => o.name?.toLowerCase() === 'size');

      // Colors
      colorBox.innerHTML = '';
      chosen = { color: undefined, size: undefined };

      if(optColor && optColor.values?.length){
        colorWrap.hidden = false;
        optColor.values.forEach((v,i)=>{
          const label = v.value || v;
          const b = root.createElement('button');
          b.type = 'button';
          b.textContent = label;
          b.dataset.value = label;
          b.addEventListener('click', ()=>{
            [...colorBox.children].forEach(x=>x.removeAttribute('data-active'));
            b.setAttribute('data-active','true');
            chosen.color = label;
          });
          if(i===0){ b.setAttribute('data-active','true'); chosen.color = label; }
          colorBox.appendChild(b);
        });
      }else{
        colorWrap.hidden = true;
      }

      // Sizes
      sizeSel.innerHTML = '';
      if(optSize && optSize.values?.length){
        sizeWrap.hidden = false;
        const ph = root.createElement('option');
        ph.value = ''; ph.textContent = 'Choose your size';
        sizeSel.appendChild(ph);
        optSize.values.forEach(v=>{
          const label = v.value || v;
          const o = root.createElement('option');
          o.value = label; o.textContent = label;
          sizeSel.appendChild(o);
        });
        sizeSel.onchange = ()=>{ chosen.size = sizeSel.value || undefined; };
      }else{
        sizeWrap.hidden = true;
      }

      statusEl.textContent = '';
      addBtn.disabled = false;

      modal.hidden = false;
      root.body.style.overflow = 'hidden';
    }

    function close(){
      modal.hidden = true;
      root.body.style.overflow = '';
    }

    function findVariantId(){
      if(!current) return null;
      const names = (current.options || []).map(o=>o.name?.toLowerCase());
      for(const v of current.variants || []){
        let ok = true;
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
      const first = (current.variants || []).find(v=>v.available);
      return first ? first.id : null;
    }

    async function addToCart(variantId, qty){
      const r = await fetch('/cart/add.js', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id: variantId, quantity: qty })
      });
      if(!r.ok) throw new Error('Add to cart failed');
      return r.json();
    }

    // Open (image or +)
    root.addEventListener('click', (e)=>{
      const t = e.target.closest('[data-open-quick]');
      if(!t) return;
      e.preventDefault();
      const id = t.getAttribute('data-block-id');
      if(id) openForBlock(id);
    });

    // Close
    modal.addEventListener('click', (e)=>{
      if(e.target.hasAttribute('data-close') || e.target === modal) close();
    });
    root.addEventListener('keydown', (e)=>{ if(e.key === 'Escape' && !modal.hidden) close(); });

    // Add to cart + bonus
    addBtn.addEventListener('click', async ()=>{
      try{
        addBtn.disabled = true;
        statusEl.textContent = 'Adding…';
        const mainId = findVariantId();
        if(!mainId) throw new Error('No available variant');
        await addToCart(mainId, 1);

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
  }

  // Boot now (if section already in DOM)
  function boot(scope){
    try{ initOnce(scope); }catch(e){ console.error('[EE QV]', e); }
  }

  // 1) Standard load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ()=>boot());
  } else {
    boot();
  }

  // 2) Theme Editor hot-reload — re-init when the grid section is re-rendered
  document.addEventListener('shopify:section:load', (ev)=>{
    const section = ev.target;
    if(section && section.matches('.ee-grid-section, .ee-grid')) boot(section);
  });
})();
