/**
 * CAMPUSVAULT - Vault AI Multilingual Response Engine
 * Provides independent AI response translation while preserving
 * document titles, IDs, classifications, and cryptographic security terms.
 */

export type AiLanguageChoice =
  | "auto"
  | "en"
  | "hi"
  | "hinglish"
  | "zh"
  | "es"
  | "fr"
  | "de"
  | "ja"
  | "ko"
  | "ar"
  | "pt";

/**
 * Detect language of user prompt for "auto" mode
 */
export function detectPromptLanguage(prompt: string): string {
  const text = prompt.trim().toLowerCase();

  // Devanagari script detection (Hindi)
  if (/[\u0900-\u097F]/.test(text)) {
    return "hi";
  }

  // Chinese script detection
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return "zh";
  }

  // Japanese Hiragana/Katakana
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return "ja";
  }

  // Korean Hangul
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) {
    return "ko";
  }

  // Arabic script detection
  if (/[\u0600-\u06FF]/.test(text)) {
    return "ar";
  }

  // Hinglish detection (Latin script Hindi keywords)
  const hinglishWords = [
    "kya",
    "mera",
    "mere",
    "bhejo",
    "bhejna",
    "dikhaye",
    "kisko",
    "kaun",
    "kaise",
    "hai",
    "hain",
    "nahi",
    "mujhe",
    "karo",
    "chahiye",
    "batao",
    "access",
    "shikshak",
  ];
  const words = text.split(/\s+/);
  const hinglishCount = words.filter((w) => hinglishWords.includes(w)).length;
  if (hinglishCount >= 2 || (words.length <= 4 && hinglishCount >= 1)) {
    return "hinglish";
  }

  // Spanish keywords
  if (/\b(hola|por favor|documento|profesor|acceso|enviar|gracias)\b/i.test(text)) {
    return "es";
  }

  // French keywords
  if (/\b(bonjour|s'il vous plait|document|professeur|acces|envoyer|merci)\b/i.test(text)) {
    return "fr";
  }

  // German keywords
  if (/\b(hallo|bitte|dokument|professor|zugriff|senden|danke)\b/i.test(text)) {
    return "de";
  }

  // Default to English
  return "en";
}

/**
 * Format and adapt an AI message to the requested AI language preference.
 * Ensures document names, IDs, and technical Zero-Trust terms remain uncorrupted.
 */
export function formatAiResponseInLanguage(
  englishResponse: string,
  targetLang: string,
  userPrompt: string
): string {
  const effectiveLang =
    targetLang === "auto" ? detectPromptLanguage(userPrompt) : targetLang;

  if (effectiveLang === "en" || !effectiveLang) {
    return englishResponse;
  }

  // Language translation rules for key responses
  switch (effectiveLang) {
    case "hi":
      return adaptToHindi(englishResponse);
    case "hinglish":
      return adaptToHinglish(englishResponse);
    case "zh":
      return adaptToChinese(englishResponse);
    case "es":
      return adaptToSpanish(englishResponse);
    case "fr":
      return adaptToFrench(englishResponse);
    case "de":
      return adaptToGerman(englishResponse);
    case "ja":
      return adaptToJapanese(englishResponse);
    case "ko":
      return adaptToKorean(englishResponse);
    case "ar":
      return adaptToArabic(englishResponse);
    case "pt":
      return adaptToPortuguese(englishResponse);
    default:
      return englishResponse;
  }
}

function adaptToHindi(text: string): string {
  let res = text;
  // Greeting and introductions
  res = res.replace(/Hello ([^!]+)! I am your private CampusVault Document Assistant\./g, "नमस्ते $1! मैं आपका निजी कैंपसवाल्ट दस्तावेज़ सहायक हूँ।");
  res = res.replace(/Under Zero-Trust security, I only have access to records permitted for your verified account/g, "ज़ीरो-ट्रस्ट सुरक्षा के अंतर्गत, मुझे केवल आपके सत्यापित खाते के लिए स्वीकृत रिकॉर्ड तक ही पहुँच प्राप्त है");
  res = res.replace(/You can ask me:/g, "आप मुझसे पूछ सकते हैं:");
  res = res.replace(/Is any new document available for my department\?/g, "क्या मेरे विभाग के लिए कोई नया दस्तावेज़ उपलब्ध है?");
  res = res.replace(/Which documents can I access\?/g, "मैं किन दस्तावेज़ों तक पहुँच सकता हूँ?");
  res = res.replace(/Do I have any pending access grants or requests\?/g, "क्या मेरी कोई लंबित पहुँच अनुमति या अनुरोध है?");
  res = res.replace(/Has any of my document access expired or been revoked\?/g, "क्या मेरे किसी दस्तावेज़ की पहुँच समाप्त या रद्द की गई है?");
  // Common phrases
  res = res.replace(/Zero-Trust Campus Security Protocol/g, "जीरो-ट्रस्ट परिसर सुरक्षा प्रोटोकॉल");
  res = res.replace(/Here is the document status for/g, "दस्तावेज़ की स्थिति इस प्रकार है:");
  res = res.replace(/Authorized Documents You Can Access/g, "अधिकृत दस्तावेज़ जिन तक आपकी पहुँच है");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "पात्र विभागीय दस्तावेज़ जिनकी अनुमति प्रतीक्षित है");
  res = res.replace(/Active Access Granted/g, "सक्रिय अनुमति स्वीकृत");
  res = res.replace(/Relevant to your department, but your account has not received access yet\./g, "आपके विभाग से संबंधित है, लेकिन आपके खाते को अभी अनुमति नहीं मिली है।");
  res = res.replace(/Your access request for/g, "के लिए आपका पहुँच अनुरोध");
  res = res.replace(/has been officially submitted with status PENDING/g, "आधिकारिक तौर पर PENDING स्थिति के साथ दर्ज कर लिया गया है");
  res = res.replace(/An authorized Department Administrator or Faculty member will review it\./g, "एक अधिकृत विभागाध्यक्ष या संकाय सदस्य इसकी समीक्षा करेंगे।");
  res = res.replace(/Sorry, I cannot disclose other users' private document-sharing activities/g, "क्षमा करें, मैं अन्य उपयोगकर्ताओं के निजी दस्तावेज़ साझाकरण विवरण का खुलासा नहीं कर सकता");
  res = res.replace(/Cryptographic keys, password hashes, and physical storage paths are confidential/g, "क्रिप्टोग्राफ़िक कुंजियाँ, पासवर्ड हैश और भौतिक भंडारण पथ गोपनीय और सुरक्षित हैं");
  res = res.replace(/You currently have no uploaded documents\./g, "वर्तमान में आपका कोई अपलोड किया गया दस्तावेज़ नहीं है।");
  res = res.replace(/You have no active access grants\./g, "आपके पास कोई सक्रिय पहुँच अनुमति नहीं है।");
  res = res.replace(/Access requests do not grant automatic access\./g, "अनुरोध करने से स्वतः पहुँच प्रदान नहीं होती है।");
  return res;
}

function adaptToHinglish(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "Yeh raha document status for");
  res = res.replace(/Authorized Documents You Can Access/g, "Authorized Documents jinka access aapke paas hai");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "Eligible Department Documents jinka grant pending hai");
  res = res.replace(/Active Access Granted/g, "Active Access Granted");
  res = res.replace(/Relevant to your department, but your account has not received access yet\./g, "Aapke department ke liye relevant hai, par aapke account ko abhi access nahi mila hai.");
  res = res.replace(/Your access request for/g, "Aapka access request for");
  res = res.replace(/has been officially submitted with status PENDING/g, "officially submit ho gaya hai with status PENDING");
  res = res.replace(/An authorized Department Administrator or Faculty member will review it\./g, "Authorized Faculty ya Admin ise review karenge.");
  res = res.replace(/Sorry, I cannot disclose other users' private document-sharing activities/g, "Sorry, main kisi doosre user ki private document sharing details disclose nahi kar sakta.");
  res = res.replace(/Cryptographic keys, password hashes, and physical storage paths are confidential/g, "Encryption keys, password hashes aur internal storage paths confidential aur Zero-Trust protected hain.");
  res = res.replace(/You currently have no uploaded documents\./g, "Filhal aapka koi uploaded document nahi hai.");
  res = res.replace(/You have no active access grants\./g, "Aapke paas koi active access grant nahi hai.");
  res = res.replace(/Access requests do not grant automatic access\./g, "Access request se automatic download access nahi milta.");
  return res;
}

function adaptToChinese(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "以下是相关文档状态：");
  res = res.replace(/Authorized Documents You Can Access/g, "您有权访问的已授权文档");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "符合院系资格但尚未授权的文档");
  res = res.replace(/Active Access Granted/g, "已授予有效访问权限");
  res = res.replace(/Relevant to your department, but your account has not received access yet\./g, "属于您的院系，但您的账户尚未获得访问授权。");
  res = res.replace(/has been officially submitted with status PENDING/g, "已正式提交，状态为 PENDING");
  res = res.replace(/An authorized Department Administrator or Faculty member will review it\./g, "院系管理员或教师将对其进行审核。");
  res = res.replace(/Cryptographic keys, password hashes, and physical storage paths are confidential/g, "密钥、密码哈希和存储路径均属于保密范围并受零信任保护。");
  return res;
}

function adaptToSpanish(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "Aquí está el estado de los documentos para");
  res = res.replace(/Authorized Documents You Can Access/g, "Documentos autorizados a los que tiene acceso");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "Documentos del departamento pendientes de autorización");
  res = res.replace(/Active Access Granted/g, "Acceso Activo Concedido");
  res = res.replace(/has been officially submitted with status PENDING/g, "ha sido enviada oficialmente con estado PENDING");
  res = res.replace(/An authorized Department Administrator or Faculty member will review it\./g, "Un administrador de departamento o docente autorizado la revisará.");
  res = res.replace(/Cryptographic keys, password hashes, and physical storage paths are confidential/g, "Las claves criptográficas, los hashes de contraseñas y las rutas de almacenamiento son confidenciales.");
  return res;
}

function adaptToFrench(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "Voici le statut des documents pour");
  res = res.replace(/Authorized Documents You Can Access/g, "Documents autorisés auxquels vous avez accès");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "Documents de département éligibles en attente d'accès");
  res = res.replace(/Active Access Granted/g, "Accès Actif Accordé");
  res = res.replace(/has been officially submitted with status PENDING/g, "a été soumise avec le statut PENDING");
  res = res.replace(/An authorized Department Administrator or Faculty member will review it\./g, "Un administrateur ou enseignant habilité va examiner la demande.");
  return res;
}

function adaptToGerman(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "Hier ist der Dokumentenstatus für");
  res = res.replace(/Authorized Documents You Can Access/g, "Autorisierte Dokumente, auf die Sie Zugriff haben");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "Berechtigte Fachbereichsdokumente mit ausstehender Freigabe");
  res = res.replace(/Active Access Granted/g, "Aktiver Zugriff gewährt");
  res = res.replace(/has been officially submitted with status PENDING/g, "wurde offiziell mit Status PENDING eingereicht");
  return res;
}

function adaptToJapanese(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "以下の文書状況をご確認ください：");
  res = res.replace(/Authorized Documents You Can Access/g, "アクセス権が付与された認証済み文書");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "所属部署向けで権限申請待ちの文書");
  res = res.replace(/Active Access Granted/g, "有効なアクセス権あり");
  res = res.replace(/has been officially submitted with status PENDING/g, "ステータス PENDING として正式に申請されました");
  return res;
}

function adaptToKorean(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "다음은 해당 문서 상태입니다:");
  res = res.replace(/Authorized Documents You Can Access/g, "열람 권한이 부여된 문서 목록");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "학부 대상 문서 중 권한 부여 대기 중인 문서");
  res = res.replace(/Active Access Granted/g, "활성 권한 부여됨");
  res = res.replace(/has been officially submitted with status PENDING/g, "PENDING 상태로 공식 접수되었습니다");
  return res;
}

function adaptToArabic(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "إليك حالة المستندات لـ");
  res = res.replace(/Authorized Documents You Can Access/g, "المستندات المصرح لك بالوصول إليها");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "مستندات القسم المؤهلة بانتظار منح الإذن");
  res = res.replace(/Active Access Granted/g, "إذن وصول نشط وممنوح");
  res = res.replace(/has been officially submitted with status PENDING/g, "تم تقديمه رسميًا بحالة PENDING");
  return res;
}

function adaptToPortuguese(text: string): string {
  let res = text;
  res = res.replace(/Here is the document status for/g, "Aqui está o status dos documentos para");
  res = res.replace(/Authorized Documents You Can Access/g, "Documentos autorizados que você pode acessar");
  res = res.replace(/Eligible Department Documents Awaiting Grant/g, "Documentos do departamento aguardando concessão de acesso");
  res = res.replace(/Active Access Granted/g, "Acesso Ativo Concedido");
  res = res.replace(/has been officially submitted with status PENDING/g, "foi submetido oficialmente com o status PENDING");
  return res;
}
