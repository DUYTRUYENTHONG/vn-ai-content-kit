import {createHash} from 'node:crypto';

const mechanisms=new Set(['buyer-question','everyday-tension','assumption-reversal','specific-situation']);
const normalized=value=>typeof value==='string'?value.normalize('NFC').trim():'';
const required=(value,name)=>{const text=normalized(value);if(!text)throw Error(`Missing ${name}`);return text;};
const occurrences=(text,phrase)=>text.split(phrase).length-1;

// Checks editorial consistency only. Never inserts tags into speech or approves audio.
export function reviewHookDirection(input){
  if(input?.schemaVersion!==1)throw Error('Unsupported hook direction schema');
  const script=required(input.script,'script');
  const scriptSha256=createHash('sha256').update(script).digest('hex');
  if(input.scriptSha256&&input.scriptSha256!==scriptSha256)throw Error('Hook direction belongs to a different script');
  const hook=required(input.hook,'hook');
  if(!script.startsWith(hook)||script.length===hook.length)throw Error('Hook must be the exact opening of a script with a body');
  if(!mechanisms.has(input.mechanism))throw Error('Choose a supported hook mechanism');
  const focusPhrase=required(input.focusPhrase,'focusPhrase');
  if(occurrences(hook,focusPhrase)!==1)throw Error('Focus phrase must occur exactly once in the hook');
  const pauseAfterPhrase=required(input.pauseAfterPhrase,'pauseAfterPhrase');
  if(occurrences(hook,pauseAfterPhrase)!==1)throw Error('Pause cue must identify one exact hook phrase');
  const payoffPhrase=required(input.payoffPhrase,'payoffPhrase');
  if(!script.slice(hook.length).includes(payoffPhrase))throw Error('Promised payoff must appear in the script body');
  if(!Array.isArray(input.sourceRefs)||!input.sourceRefs.length||input.sourceRefs.some(s=>!normalized(s)))throw Error('Keep nonempty source references for review');
  return {
    schemaVersion:1,languageTarget:'vi-VN',domain:'ecommerce-product-ads',script,scriptSha256,
    hook,mechanism:input.mechanism,focusPhrase,pauseAfterPhrase,payoffPhrase,
    buyerConcern:required(input.buyerConcern,'buyerConcern'),
    reasonToContinue:required(input.reasonToContinue,'reasonToContinue'),sourceRefs:input.sourceRefs,
    direction:required(input.direction,'direction'),
    consistencyChecked:true,claimsVerified:false,deliveryVerified:false,
    listeningApproved:false,publicationReady:false,trainingReady:false,
    providerControlApplied:false,
    reviewChecklist:['Check verified facts and offer eligibility','Compare actual normalized hook text',
      'Listen for the intended focus, question contour and pause without shouting',
      'Confirm the body earns the opening promise before the CTA'],
  };
}
