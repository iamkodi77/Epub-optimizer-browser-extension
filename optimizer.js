/* Local EPUB processing. The original Python converter inspired the device profiles. */
const Optimizer = (() => {
  const profiles = { x4: [480, 800, 4], x4pro: [480, 800, 4], x3: [528, 792, 4], kindle: [600, 800, 16] };
  const xml = (s, name) => { const doc = new DOMParser().parseFromString(s, 'application/xml'); if (doc.querySelector('parsererror')) throw new Error(`Invalid ${name} XML.`); return doc; };
  const elements = (doc, name) => Array.from(doc.getElementsByTagNameNS('*', name));
  const serialize = doc => new XMLSerializer().serializeToString(doc);
  const pathFor = (base, href) => {
    const path = decodeURIComponent(href.split('#')[0].split('?')[0]);
    if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('/')) return null;
    const parts = (base + path).split('/'), out = [];
    for (const part of parts) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
    return out.join('/');
  };
  async function inspect(file) {
    if (!file || !/\.epub$/i.test(file.name)) throw new Error('Please choose an EPUB file.');
    if (file.size > 100 * 1024 * 1024) throw new Error('The file exceeds the 100 MB limit.');
    let zip; try { zip = await JSZip.loadAsync(await file.arrayBuffer()); } catch { throw new Error('Could not open this EPUB. Make sure it is a valid EPUB file.'); }
    const container = zip.file('META-INF/container.xml');
    if (!container) throw new Error('This EPUB is missing META-INF/container.xml.');
    const root = elements(xml(await container.async('string'), 'container'), 'rootfile')[0];
    const opfPath = root && root.getAttribute('full-path');
    if (!opfPath || !zip.file(opfPath)) throw new Error('Could not find the EPUB package file.');
    if (zip.file('META-INF/encryption.xml')) throw new Error('This EPUB contains encrypted resources or obfuscated fonts and cannot be processed safely.');
    const doc = xml(await zip.file(opfPath).async('string'), 'package');
    if (!elements(doc, 'manifest').length || !elements(doc, 'metadata').length) throw new Error('The EPUB package is missing its manifest or metadata.');
    const metadata=elements(doc,'metadata')[0];
    const metaValue = name => elements(metadata,'meta').find(m => m.getAttribute('name') === name)?.getAttribute('content') || '';
    return { zip, opfPath, doc, title: elements(doc, 'title')[0]?.textContent || '', author: elements(doc, 'creator')[0]?.textContent || '', year: (elements(metadata,'date')[0]?.textContent || '').slice(0,4), language: elements(metadata,'language')[0]?.textContent || '', series: metaValue('calibre:series'), series_index: metaValue('calibre:series_index') };
  }
  async function image(blob, profile, quality, type, optimize = true, settings = {}) {
    const bitmap = await createImageBitmap(blob);
    try {
      const [maxW,maxH,levels] = profile, scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      if (optimize) {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height), p = data.data, w = canvas.width, h = canvas.height;
        const grayscale = settings.grayscale !== false, contrast = settings.contrast !== false, quantize = grayscale && settings.quantize !== false;
        const clamp = v => Math.max(0, Math.min(255, v));
        if (grayscale) {
          const gray = new Float32Array(w*h);
          for (let i=0;i<gray.length;i++) { const v=0.299*p[i*4]+0.587*p[i*4+1]+0.114*p[i*4+2]; gray[i]=clamp(contrast ? (v-128)*1.5+128 : v); }
          for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
            const i=y*w+x, old=clamp(gray[i]), value=quantize ? Math.round(old*(levels-1)/255)*255/(levels-1) : old, err=old-value;
            p[i*4]=p[i*4+1]=p[i*4+2]=value; p[i*4+3]=255;
            if(quantize && x+1<w) gray[i+1]+=err*7/16; if(quantize && y+1<h) { if(x>0) gray[i+w-1]+=err*3/16; gray[i+w]+=err*5/16; if(x+1<w) gray[i+w+1]+=err/16; }
          }
        } else if (contrast) {
          for (let i=0;i<p.length;i+=4) for(let c=0;c<3;c++) p[i+c]=clamp((p[i+c]-128)*1.5+128);
        }
        ctx.putImageData(data,0,0);
      }
      return await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image encoding failed')), type, quality/100));
    } finally { bitmap.close(); }
  }
  function cleanText(doc, quotes) {
    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT); let node, count = 0;
    while ((node = walker.nextNode())) {
      let parent=node.parentElement, skip=false;
      while(parent) { if (['script','style','pre','code','kbd','samp'].includes(parent.localName.toLowerCase())) { skip=true; break; } parent=parent.parentElement; }
      if(skip) continue;
      let value=node.nodeValue.replace(/[ \t]{2,}/g,' ').replace(/[ﬁﬂﬃﬄﬀ]/g, c => ({'ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl','ﬀ':'ff'}[c]));
      if (quotes) value = value.replace(/[‘’“”–—…\u00a0]/g, c => ({'‘':"'",'’':"'",'“':'"','”':'"','–':'-','—':'--','…':'...','\u00a0':' '}[c]));
      if(value!==node.nodeValue) { node.nodeValue=value; count++; }
    }
    return count;
  }
  async function replaceCover(zip, doc, base, coverFile, opts) {
    const metadata = elements(doc, 'metadata')[0], manifest = elements(doc, 'manifest')[0];
    const items = elements(manifest, 'item');
    const coverMeta = elements(metadata, 'meta').find(m => (m.getAttribute('name') || '').toLowerCase() === 'cover');
    const byProperty = items.find(item => (item.getAttribute('properties') || '').split(/\s+/).includes('cover-image'));
    const byMeta = coverMeta && items.find(item => item.getAttribute('id') === coverMeta.getAttribute('content'));
    if (byProperty && byMeta && byProperty !== byMeta) throw new Error('The EPUB has conflicting cover references; the cover cannot be replaced safely.');
    let target = byProperty || byMeta;
    if (coverMeta && !byMeta) throw new Error('The EPUB cover metadata points to a missing manifest item.');
    const ns = manifest.namespaceURI;
    let path, type, added = false;
    if (target) {
      type = target.getAttribute('media-type');
      if (!['image/jpeg', 'image/png'].includes(type)) throw new Error('The existing cover is not a JPEG or PNG; replacing this cover format is not yet supported.');
      path = pathFor(base, target.getAttribute('href') || '');
      if (!path || !zip.file(path)) throw new Error('The existing cover image is missing from the EPUB.');
    } else {
      const spine = elements(doc, 'spine')[0];
      if (!spine) throw new Error('Cannot add a cover: the EPUB has no spine.');
      // Generate names and IDs that do not collide with existing files or OPF IDs.
      const ids = new Set(Array.from(doc.getElementsByTagName('*')).map(el => el.getAttribute('id')).filter(Boolean));
      let n = 0, imageId, pageId, imageName, pageName;
      do { const suffix = n ? '-' + n : ''; imageId = 'optimizer-cover' + suffix; pageId = 'optimizer-cover-page' + suffix; imageName = imageId + '.jpg'; pageName = pageId + '.xhtml'; n++; }
      while (ids.has(imageId) || ids.has(pageId) || zip.file(base + imageName) || zip.file(base + pageName));
      path = base + imageName; type = 'image/jpeg'; added = true;
      target = doc.createElementNS(ns, 'item'); target.setAttribute('id', imageId); target.setAttribute('href', imageName); target.setAttribute('media-type', type);
      const version = doc.documentElement.getAttribute('version') || '';
      if (version.startsWith('3')) target.setAttribute('properties', 'cover-image');
      manifest.appendChild(target);
      const page = doc.createElementNS(ns, 'item'); page.setAttribute('id', pageId); page.setAttribute('href', pageName); page.setAttribute('media-type', 'application/xhtml+xml'); manifest.appendChild(page);
      const ref = doc.createElementNS(spine.namespaceURI, 'itemref'); ref.setAttribute('idref', pageId); spine.insertBefore(ref, spine.firstChild);
      zip.file(base + pageName, `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cover</title></head><body style="margin:0;text-align:center"><div><img src="${imageName}" alt="Cover" style="max-width:100%;max-height:100%" /></div></body></html>`);
      if (!version.startsWith('3')) {
        const meta = doc.createElementNS(metadata.namespaceURI, 'meta'); meta.setAttribute('name', 'cover'); meta.setAttribute('content', imageId); metadata.appendChild(meta);
      }
    }
    let encoded;
    try { encoded = await image(coverFile, profiles[opts.device], opts.quality, type, opts.images, opts); }
    catch { throw new Error('The selected cover image could not be decoded. Choose a different image.'); }
    zip.file(path, encoded);
    return added ? 'added' : 'replaced';
  }
  async function process(book, opts, progress) {
    // Work on a fresh copy so a failed run or changed options never modifies the source.
    const fresh = await inspect(opts.file), {zip, doc, opfPath} = fresh;
    const base=opfPath.includes('/') ? opfPath.slice(0,opfPath.lastIndexOf('/')+1) : '';
    const title=elements(doc,'title')[0], author=elements(doc,'creator')[0];
    if(title && opts.title.trim()) title.textContent=opts.title.trim();
    if(author && opts.author.trim()) author.textContent=opts.author.trim();
    const items=elements(doc,'manifest')[0]; let images=0, text=0, fonts=0, skipped=0;
    const manifest=elements(items,'item');
    for(let i=0;i<manifest.length;i++) {
      const item=manifest[i], href=item.getAttribute('href') || '', media=item.getAttribute('media-type') || '', path=pathFor(base,href), entry=path && zip.file(path);
      progress(`Processing ${i+1} of ${manifest.length} resources…`);
      if(!entry) continue;
      if(opts.images && ['image/jpeg','image/png'].includes(media)) {
        try { const result=await image(await entry.async('blob'),profiles[opts.device],opts.quality,media,true,opts); zip.file(path,result); images++; } catch(e) { console.warn('Image skipped:',path,e); skipped++; }
      } else if(opts.text && ['application/xhtml+xml','text/html'].includes(media)) {
        // Only well-formed XML is rewritten; HTML recovery can damage EPUB structure.
        try { const content=xml(await entry.async('string'),path); const n=cleanText(content, opts.quotes); if(n) { zip.file(path,serialize(content)); text+=n; } } catch { skipped++; }
      }
      // Font files are retained: deleting them without a full CSS parser can break references.
    }
    if(opts.fonts) {
      // Remove @font-face rules from CSS while keeping files and manifest references intact.
      for(const item of manifest) if(item.getAttribute('media-type')==='text/css') {
        const path=pathFor(base,item.getAttribute('href') || ''), entry=path && zip.file(path); if(!entry) continue;
        const css=await entry.async('string'); const updated=css.replace(/@font-face\s*\{[^{}]*\}/gi, () => { fonts++; return ''; }); if(updated!==css) zip.file(path,updated);
      }
    }
    let metadataRemoved = 0;
    if (opts.cleanMetadata) {
      const metadata = elements(doc,'metadata')[0];
      for (const meta of elements(metadata,'meta')) {
        const name=meta.getAttribute('name') || '', property=meta.getAttribute('property') || '';
        if ((/^(calibre:|ibooks:|amazon:|kindle:)/i.test(name) || /^(calibre:|ibooks:|amazon:|kindle:)/i.test(property) || ['Sigil version','dtb:uid'].includes(name)) && !meta.hasAttribute('id')) { meta.remove(); metadataRemoved++; }
      }
    }
    let cover = null;
    if (!opts.cover && opts.generateCover) {
      const metadata=elements(doc,'metadata')[0];
      const declared=elements(items,'item').some(item => (item.getAttribute('properties') || '').split(/\s+/).includes('cover-image')) || elements(metadata,'meta').some(m => (m.getAttribute('name') || '').toLowerCase()==='cover');
      if (!declared) {
        progress('Generating cover…');
        const canvas=document.createElement('canvas'); const [w,h]=profiles[opts.device]; canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Canvas is unavailable for cover generation.');
        ctx.fillStyle='#f5f5f2'; ctx.fillRect(0,0,w,h); ctx.fillStyle='#262626'; ctx.textAlign='center';
        const wrap=(value,maxWidth) => { const words=value.split(/\s+/), lines=[]; let line=''; for(const word of words) { const next=line ? line+' '+word : word; if(ctx.measureText(next).width>maxWidth && line) { lines.push(line); line=word; } else line=next; } if(line) lines.push(line); return lines; };
        ctx.font=`bold ${Math.round(w/14)}px serif`;
        const lines=wrap((opts.title || fresh.title || 'Untitled').trim(),w*0.8).slice(0,8); lines.forEach((line,i)=>ctx.fillText(line,w/2,h*0.35+i*w/12,w*0.8));
        ctx.font=`${Math.round(w/22)}px serif`; wrap((opts.author || fresh.author || '').trim(),w*0.8).slice(0,3).forEach((line,i)=>ctx.fillText(line,w/2,h*0.72+i*w/18,w*0.8));
        const generated=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Cover generation failed.')),'image/jpeg',0.9));
        await replaceCover(zip,doc,base,generated,opts); cover='generated';
      }
    }
    if (opts.cover) { progress('Applying cover image…'); cover = await replaceCover(zip, doc, base, opts.cover, opts); }
    zip.file(opfPath,serialize(doc));
    const out=new JSZip(); out.file('mimetype','application/epub+zip',{compression:'STORE'});
    for(const [name,entry] of Object.entries(zip.files)) {
      if(name==='mimetype' || entry.dir || /(^|\/)(__MACOSX|\.git|\.svn)(\/|$)/.test(name) || /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(name)) continue;
      out.file(name, await entry.async('uint8array'), {compression:'DEFLATE', createFolders:false});
    }
    progress('Packaging your EPUB…');
    const blob=await out.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
    return {blob, images, text, fonts, skipped, cover, metadataRemoved};
  }
  return {inspect, process};
})();
