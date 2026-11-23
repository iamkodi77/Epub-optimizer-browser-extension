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
    return { zip, opfPath, doc, title: elements(doc, 'title')[0]?.textContent || '', author: elements(doc, 'creator')[0]?.textContent || '' };
  }
  async function image(blob, profile, quality, type) {
    const bitmap = await createImageBitmap(blob);
    try {
      const [maxW,maxH,levels] = profile, scale = Math.min(1, maxW / bitmap.width, maxH / bitmap.height);
      const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas is unavailable');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height), p = data.data, w = canvas.width, h = canvas.height;
      const gray = new Float32Array(w*h);
      for (let i=0;i<gray.length;i++) gray[i] = Math.max(0, Math.min(255, (0.299*p[i*4]+0.587*p[i*4+1]+0.114*p[i*4+2]-128)*1.5+128));
      for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
        const i=y*w+x, old=Math.max(0,Math.min(255,gray[i])), value=Math.round(old*(levels-1)/255)*255/(levels-1), err=old-value;
        p[i*4]=p[i*4+1]=p[i*4+2]=value; p[i*4+3]=255;
        if(x+1<w) gray[i+1]+=err*7/16; if(y+1<h) { if(x>0) gray[i+w-1]+=err*3/16; gray[i+w]+=err*5/16; if(x+1<w) gray[i+w+1]+=err/16; }
      }
      ctx.putImageData(data,0,0);
      return await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Image encoding failed')), type, quality/100));
    } finally { bitmap.close(); }
  }
  function cleanText(doc) {
    const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT); let node, count = 0;
    while ((node = walker.nextNode())) {
      let parent=node.parentElement, skip=false;
      while(parent) { if (['script','style','pre','code','kbd','samp'].includes(parent.localName.toLowerCase())) { skip=true; break; } parent=parent.parentElement; }
      if(skip) continue;
      const value=node.nodeValue.replace(/[ \t]{2,}/g,' ').replace(/[ﬁﬂﬃﬄﬀ]/g, c => ({'ﬁ':'fi','ﬂ':'fl','ﬃ':'ffi','ﬄ':'ffl','ﬀ':'ff'}[c]));
      if(value!==node.nodeValue) { node.nodeValue=value; count++; }
    }
    return count;
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
        try { const result=await image(await entry.async('blob'),profiles[opts.device],opts.quality,media); zip.file(path,result); images++; } catch(e) { console.warn('Image skipped:',path,e); skipped++; }
      } else if(opts.text && ['application/xhtml+xml','text/html'].includes(media)) {
        // Only well-formed XML is rewritten; HTML recovery can damage EPUB structure.
        try { const content=xml(await entry.async('string'),path); const n=cleanText(content); if(n) { zip.file(path,serialize(content)); text+=n; } } catch { skipped++; }
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
    zip.file(opfPath,serialize(doc));
    const out=new JSZip(); out.file('mimetype','application/epub+zip',{compression:'STORE'});
    for(const [name,entry] of Object.entries(zip.files)) {
      if(name==='mimetype' || entry.dir || /(^|\/)(__MACOSX|\.git|\.svn)(\/|$)/.test(name) || /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/.test(name)) continue;
      out.file(name, await entry.async('uint8array'), {compression:'DEFLATE', createFolders:false});
    }
    progress('Packaging your EPUB…');
    const blob=await out.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
    return {blob, images, text, fonts, skipped};
  }
  return {inspect, process};
})();
