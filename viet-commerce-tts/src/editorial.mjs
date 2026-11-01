export function prepareScript(text,{pronunciations=[]}={}){
  if(typeof text!=='string'||text.trim().length<10||text.length>1500)throw Error('Use a short Vietnamese narration of10–1500characters');
  let spoken=text.normalize('NFC').replace(/\r\n?/gu,'\n').split('\n').map(s=>s.replace(/[\t ]+/gu,' ').trim()).join('\n').trim();
  const applied=[];
  for(const rule of pronunciations){
    if(rule.textPreparationReviewed!==true)continue;
    if(!rule.display||!rule.spoken||!rule.sourceRef)throw Error('Reviewed pronunciation entries need display, spoken and sourceRef');
    const escaped=rule.display.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
    const pattern=new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`,'gu');
    spoken=spoken.replace(pattern,(_,prefix)=>{applied.push(rule.display);return prefix+rule.spoken;});
  }
  return {languageTarget:'vi-VN',domain:'ecommerce-product-ads',displayText:text.normalize('NFC').trim(),spokenText:spoken,appliedPronunciations:[...new Set(applied)],notes:['Check the actual provider normalizer; short question punctuation may change','Review product names, units, pauses and the actual rendered audio'],listeningApproved:false,publicationReady:false};
}
