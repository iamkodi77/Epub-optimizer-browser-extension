const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const JSZip = require('jszip');

function browser() {
  const w = new JSDOM('', {runScripts:'outside-only'}).window;
  w.JSZip=JSZip;
  w.createImageBitmap=async () => ({width:100,height:150,close(){}});
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){},fillText(){},measureText(s){return {width:s.length*10}}});
  w.HTMLCanvasElement.prototype.toBlob=fn=>fn(new Uint8Array([1,2,3]));
  w.eval(fs.readFileSync('optimizer.js','utf8')+';window.Optimizer=Optimizer');
  return w.Optimizer;
}
async function fixture(cover='none') {
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>');
  const item=cover==='none'?'':`<item id="cover" href="cover.jpg" media-type="image/jpeg" ${cover==='epub3'?'properties="cover-image"':''}/>`;
  const meta=cover==='epub2'?'<meta name="cover" content="cover"/>':'';
  zip.file('OPS/book.opf',`<package xmlns="http://www.idpf.org/2007/opf" version="${cover==='epub3'?'3.0':'2.0'}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Test Title</dc:title><dc:creator>Author</dc:creator><dc:date>2020-01-01</dc:date><dc:language>en</dc:language><meta name="calibre:series" content="Series"/>${meta}</metadata><manifest>${item}<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>`);
  zip.file('OPS/chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Test</title></head><body><p>“Hello”  ﬁ</p><pre>“keep”  ﬁ</pre></body></html>');
  if(cover!=='none') zip.file('OPS/cover.jpg','old');
  const bytes=await zip.generateAsync({type:'uint8array'});
  return {name:'book.epub',size:bytes.length,arrayBuffer:async()=>bytes.buffer};
}
const options=file=>({file,device:'x4',images:false,text:true,fonts:false,quality:70,title:'',author:''});
async function output(result) { return JSZip.loadAsync(await result.blob.arrayBuffer()); }
test('cleans optional quotes and metadata without touching preformatted text',async()=>{
  const api=browser(),file=await fixture(),book=await api.inspect(file);
  assert.equal(book.year,'2020'); assert.equal(book.series,'Series');
  const result=await api.process(book,{...options(file),quotes:true,cleanMetadata:true},()=>{}),zip=await output(result);
  const chapter=await zip.file('OPS/chapter.xhtml').async('string'),opf=await zip.file('OPS/book.opf').async('string');
  assert.match(chapter,/"Hello" fi/); assert.match(chapter,/“keep”  ﬁ/); assert.doesNotMatch(opf,/calibre:series/); assert.equal(result.metadataRemoved,1);
});
test('generates a missing cover and preserves the EPUB mimetype',async()=>{
  const api=browser(),file=await fixture(), result=await api.process(await api.inspect(file),{...options(file),generateCover:true},()=>{}),zip=await output(result);
  assert.equal(result.cover,'generated'); assert.ok(zip.file('OPS/optimizer-cover.jpg')); assert.ok(zip.file('OPS/optimizer-cover-page.xhtml'));
  assert.equal(await zip.file('mimetype').async('string'),'application/epub+zip');
});
for(const kind of ['epub2','epub3']) test(`replaces ${kind} cover without adding a new cover page`,async()=>{
  const api=browser(),file=await fixture(kind),result=await api.process(await api.inspect(file),{...options(file),cover:{}},()=>{}),zip=await output(result);
  assert.equal(result.cover,'replaced'); assert.deepEqual(Array.from(await zip.file('OPS/cover.jpg').async('uint8array')),[1,2,3]); assert.equal(zip.file('OPS/optimizer-cover-page.xhtml'),null);
});
test('does not generate a cover when a declared cover exists',async()=>{
  const api=browser(),file=await fixture('epub3'),result=await api.process(await api.inspect(file),{...options(file),generateCover:true},()=>{});
  assert.equal(result.cover,null);
});
