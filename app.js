const $ = id => document.getElementById(id);
let file = null, book = null, downloadUrl = null, generation = 0, coverFile = null, coverUrl = null, coverGeneration = 0;
const status = message => $('status').textContent = message;
function clearDownload() { if(downloadUrl) URL.revokeObjectURL(downloadUrl); downloadUrl=null; $('download').hidden=true; $('download').removeAttribute('href'); }
function resetCover() {
  coverGeneration++; coverFile=null;
  if (coverUrl) URL.revokeObjectURL(coverUrl);
  coverUrl=null; $('cover-preview').hidden=true; $('cover-preview').removeAttribute('src');
  $('cover-placeholder').hidden=false; $('cover-reset').hidden=true;
  $('cover-description').textContent='Keep the original or choose a new image.';
  $('cover-file').value='';
}
async function selectFile(selected) {
  const current=++generation; clearDownload(); resetCover(); file=null; book=null; $('optimize').disabled=true; $('book').hidden=true; $('metadata').hidden=true; $('cover-editor').hidden=true;
  if(!selected) { status('Select a book to get started.'); return; }
  status('Reading your book…');
  try {
    const result=await Optimizer.inspect(selected); if(current!==generation) return;
    file=selected; book=result; $('book-name').textContent=file.name; $('book-size').textContent=(file.size/1048576).toFixed(2)+' MB'; $('title').value=book.title; $('author').value=book.author;
    $('book').hidden=false; $('metadata').hidden=false; $('cover-editor').hidden=false; $('optimize').disabled=false; status('Ready to optimize. Your original file won’t be changed.');
  } catch(e) { if(current===generation) status(e.message); }
}
$('file').addEventListener('change', e => { selectFile(e.target.files[0]); e.target.value=''; });
$('remove').addEventListener('click', () => selectFile(null));
$('cover-reset').addEventListener('click', () => { resetCover(); clearDownload(); status('Original cover will be kept.'); });
$('cover-file').addEventListener('change', async e => {
  const selected=e.target.files[0]; e.target.value=''; if(!selected) return;
  const current=++coverGeneration;
  if (!['image/jpeg','image/png','image/webp','image/gif','image/bmp'].includes(selected.type) || selected.size > 20*1024*1024) {
    status('Choose a JPG, PNG, WebP, GIF or BMP image up to 20 MB.'); return;
  }
  try {
    const bitmap=await createImageBitmap(selected); bitmap.close();
    if(current!==coverGeneration || !file) return;
    if(coverUrl) URL.revokeObjectURL(coverUrl);
    coverFile=selected; coverUrl=URL.createObjectURL(selected);
    $('cover-preview').src=coverUrl; $('cover-preview').hidden=false; $('cover-placeholder').hidden=true;
    $('cover-description').textContent=selected.name; $('cover-reset').hidden=false;
    clearDownload(); status('New cover selected. Optimize to apply it.');
  } catch { if(current===coverGeneration) status('Could not open that image. Please choose another cover.'); }
});
const drop=$('drop');
for(const event of ['dragenter','dragover']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('drag');});
for(const event of ['dragleave','drop']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('drag');});
drop.addEventListener('drop', e=>selectFile(e.dataTransfer.files[0]));
$('quality').addEventListener('input',()=> $('quality-value').textContent=$('quality').value+'%');
const optionIds=['images','text','fonts','grayscale','contrast','quantize','quotes','clean-metadata','generate-cover'];
$('preset').addEventListener('change', () => {
  const preset=$('preset').value;
  if (preset === 'custom') return;
  for(const id of optionIds) $(id).checked = ['images','text','grayscale','contrast','quantize'].includes(id) || preset==='full';
  clearDownload();
});
for(const id of optionIds) $(id).addEventListener('change',()=> { $('preset').value='custom'; clearDownload(); });
$('filename-format').addEventListener('change',()=> { $('template-row').hidden=$('filename-format').value!=='custom'; clearDownload(); });
for(const id of ['device','quality','title','author','filename-template']) $(id).addEventListener('input',clearDownload);
function outputFilename(source, metadata) {
  const original=source.name.replace(/\.epub$/i,''), title=$('title').value.trim(), author=$('author').value.trim();
  const fields={title,author,original,year:metadata.year,series:metadata.series,series_index:metadata.series_index,language:metadata.language};
  const format=$('filename-format').value; let name;
  if(format==='original') name=original+'-optimized';
  else if(format==='title-author') name=[title,author].filter(Boolean).join(' - ');
  else if(format==='author-title') name=[author,title].filter(Boolean).join(' - ');
  else if(format==='title') name=title;
  else {
    const template=$('filename-template').value.trim(); if(!template) throw new Error('Enter a filename template.');
    name=template.replace(/\{([^{}]+)\}/g, (_,key)=> { if(!Object.hasOwn(fields,key)) throw new Error('Unknown filename field: '+key); return fields[key] || ''; });
    if(/[{}]/.test(name)) throw new Error('Invalid filename template.');
  }
  name=name.replace(/\.epub$/i,'').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').replace(/^[ .]+|[ .]+$/g,'').slice(0,200);
  return (name || 'optimized')+'.epub';
}
$('optimize').addEventListener('click', async () => {
  if(!file || !book) return; const current=++generation, source=file; clearDownload(); $('optimize').disabled=true;
  try {
    const filename=outputFilename(source,book);
    const result=await Optimizer.process(book,{file:source,device:$('device').value,images:$('images').checked,text:$('text').checked,fonts:$('fonts').checked,quality:Number($('quality').value),title:$('title').value,author:$('author').value,cover:coverFile,grayscale:$('grayscale').checked,contrast:$('contrast').checked,quantize:$('quantize').checked,quotes:$('quotes').checked,cleanMetadata:$('clean-metadata').checked,generateCover:$('generate-cover').checked}, message => {if(current===generation) status(message);});
    if(current!==generation) return;
    downloadUrl=URL.createObjectURL(result.blob); $('download').href=downloadUrl; $('download').download=filename; $('download').hidden=false;
    status(`Done! ${result.cover ? `Cover ${result.cover}. ` : ''}${result.images} images optimized, ${result.text} text nodes cleaned, ${result.fonts} font rules removed, ${result.metadataRemoved} metadata entries removed.${result.skipped ? ` ${result.skipped} resources skipped because they could not be processed.` : ''}`);
  } catch(e) { if(current===generation) status('Could not optimize this book: '+e.message); }
  finally { if(current===generation) $('optimize').disabled=!file; }
});
