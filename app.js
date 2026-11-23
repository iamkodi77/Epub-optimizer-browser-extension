const $ = id => document.getElementById(id);
let file = null, book = null, downloadUrl = null, generation = 0;
const status = message => $('status').textContent = message;
function clearDownload() { if(downloadUrl) URL.revokeObjectURL(downloadUrl); downloadUrl=null; $('download').hidden=true; $('download').removeAttribute('href'); }
async function selectFile(selected) {
  const current=++generation; clearDownload(); file=null; book=null; $('optimize').disabled=true; $('book').hidden=true; $('metadata').hidden=true;
  if(!selected) { status('Select a book to get started.'); return; }
  status('Reading your book…');
  try {
    const result=await Optimizer.inspect(selected); if(current!==generation) return;
    file=selected; book=result; $('book-name').textContent=file.name; $('book-size').textContent=(file.size/1048576).toFixed(2)+' MB'; $('title').value=book.title; $('author').value=book.author;
    $('book').hidden=false; $('metadata').hidden=false; $('optimize').disabled=false; status('Ready to optimize. Your original file won’t be changed.');
  } catch(e) { if(current===generation) status(e.message); }
}
$('file').addEventListener('change', e => { selectFile(e.target.files[0]); e.target.value=''; });
$('remove').addEventListener('click', () => selectFile(null));
const drop=$('drop');
for(const event of ['dragenter','dragover']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('drag');});
for(const event of ['dragleave','drop']) drop.addEventListener(event,e=>{e.preventDefault();drop.classList.remove('drag');});
drop.addEventListener('drop', e=>selectFile(e.dataTransfer.files[0]));
$('quality').addEventListener('input',()=> $('quality-value').textContent=$('quality').value+'%');
$('optimize').addEventListener('click', async () => {
  if(!file || !book) return; const current=++generation, source=file; clearDownload(); $('optimize').disabled=true;
  try {
    const result=await Optimizer.process(book,{file:source,device:$('device').value,images:$('images').checked,text:$('text').checked,fonts:$('fonts').checked,quality:Number($('quality').value),title:$('title').value,author:$('author').value}, message => {if(current===generation) status(message);});
    if(current!==generation) return;
    downloadUrl=URL.createObjectURL(result.blob); $('download').href=downloadUrl; $('download').download=source.name.replace(/\.epub$/i,'')+'-optimized.epub'; $('download').hidden=false;
    status(`Done! ${result.images} images optimized, ${result.text} text nodes cleaned, ${result.fonts} font rules removed.${result.skipped ? ` ${result.skipped} resources skipped because they could not be processed.` : ''}`);
  } catch(e) { if(current===generation) status('Could not optimize this book: '+e.message); }
  finally { if(current===generation) $('optimize').disabled=!file; }
});
