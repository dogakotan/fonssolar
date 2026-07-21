export function trSnake(s){
  if(s===null||s===undefined||s==="") return null;
  const m={"ı":"i","İ":"I","ş":"s","Ş":"S","ğ":"g","Ğ":"G","ü":"u","Ü":"U","ö":"o","Ö":"O","ç":"c","Ç":"C"};
  return String(s).trim().replace(/[ıİşŞğĞüÜöÖçÇ]/g,(c)=>m[c]??c).toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
}
export function toStr(v){
  if(v===null||v===undefined) return null;
  if(typeof v==="object"){
    if("result" in v) return toStr(v.result);
    if("text" in v) return toStr(v.text);
    if("richText" in v && Array.isArray(v.richText)) return v.richText.map((r)=>r.text).join("");
    if("hyperlink" in v && "text" in v) return String(v.text);
  }
  const s=String(v).trim();
  return s===""?null:s;
}
export function toNumber(v){
  if(v===null||v===undefined||v==="") return null;
  if(typeof v==="number") return Number.isFinite(v)?v:null;
  if(v && typeof v==="object" && "result" in v) return toNumber(v.result);
  const n=Number(String(v).trim().replace(",","."));
  return Number.isFinite(n)?n:null;
}
export function toInt(v){ const n=toNumber(v); return n===null?null:Math.round(n); }
export function toBool(v){ const s=toStr(v); if(s===null) return false; return /^(evet|true|1|yes|x|✓)$/i.test(s.trim()); }
export function toDate(v){
  if(v===null||v===undefined||v==="") return null;
  if(v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate())).toISOString().slice(0,10);
  if(typeof v==="number"){ const ms=Math.round((v-25569)*86400*1000); return new Date(ms).toISOString().slice(0,10); }
  if(typeof v==="object" && "result" in v) return toDate(v.result);
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  m=s.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/);
  if(m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  const d=new Date(s);
  return isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
export const PROJECT_TYPE_TO_CODE={"Arazi GES":"arazi_ges","Endüstriyel Çatı GES":"endustriyel_cati_ges","Evsel GES":"evsel_ges"};
export const PROJECT_TYPE_TO_LABEL={arazi_ges:"Arazi GES",endustriyel_cati_ges:"Endüstriyel Çatı GES",evsel_ges:"Evsel GES"};

export const TASK_CAT_TO_LABEL={
  mobilizasyon:"Mobilizasyon",
  kolon_montaji:"Kolon Montajı",
  kiris_montaji:"Kiriş Montajı",
  asik_montaji:"Aşık Montajı",
  panel_montaji:"Panel Montajı",
  elektrik_dc:"Elektrik DC",
  elektrik_ac:"Elektrik AC",
  elektrik_og:"Elektrik OG",
  kosk_trafo:"Köşk Trafo",
  topraklama:"Topraklama",
  enh:"ENH",
  devreye_alma:"Devreye Alma",
  evrak_sureci:"Evrak Süreci",
  satin_alma:"Satın Alma",
  mekanik:"Mekanik",
};
export function projectTypeToCode(label){ const s=toStr(label); if(s===null) return null; return PROJECT_TYPE_TO_CODE[s]??trSnake(s); }
export function taskCategoryToCode(label){ const s=toStr(label); if(s===null) return null; return trSnake(s); }

export const RISK_CAT_TO_LABEL={ is_kalemi:"İş Kalemi", satin_alma:"Satın Alma", diger:"Diğer" };
export const RISK_CAT_TO_CODE={ "İş Kalemi":"is_kalemi", "Satın Alma":"satin_alma", "Diğer":"diger" };
export function riskCategoryToCode(label){ const s=toStr(label); if(s===null) return "diger"; return RISK_CAT_TO_CODE[s] ?? "diger"; }

// DUZELTME (14.07.2026, ikinci tur): liste 90'a topluyordu, panel_montaji 10 -> 20 yapildi ki toplam 100 olsun.
export const CANONICAL_CATEGORY_WEIGHTS=[
  { category:"kolon_montaji", weight_pct:10 },
  { category:"kiris_montaji", weight_pct:10 },
  { category:"asik_montaji",  weight_pct:10 },
  { category:"panel_montaji", weight_pct:20 },
  { category:"elektrik_dc",   weight_pct:10 },
  { category:"elektrik_ac",   weight_pct:10 },
  { category:"elektrik_og",   weight_pct:10 },
  { category:"kosk_trafo",    weight_pct:5  },
  { category:"topraklama",    weight_pct:5  },
  { category:"devreye_alma",  weight_pct:10 },
];

