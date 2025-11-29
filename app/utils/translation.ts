/**
 * Translation utility for real-time caption translation
 * This can be easily extended to use any translation API (Google Translate, DeepL, etc.)
 */

export interface TranslationResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

/**
 * List of supported languages for translation
 * Format: { code: "language-code", name: "Language Name" }
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "nl", name: "Dutch" },
  { code: "pl", name: "Polish" },
  { code: "tr", name: "Turkish" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "cs", name: "Czech" },
  { code: "el", name: "Greek" },
  { code: "he", name: "Hebrew" },
  { code: "th", name: "Thai" },
  { code: "vi", name: "Vietnamese" },
  { code: "id", name: "Indonesian" },
  { code: "uk", name: "Ukrainian" },
  { code: "ro", name: "Romanian" },
  { code: "hu", name: "Hungarian" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/**
 * Translate text using browser's built-in translation capabilities
 * This is a simple implementation that can be replaced with a real translation API
 * 
 * For production, you would replace this with:
 * - Google Cloud Translation API
 * - DeepL API
 * - Azure Translator
 * - Or any other translation service
 */
export async function translateText(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  // If source and target are the same, return original text
  if (sourceLanguage === targetLanguage || !text.trim()) {
    return text;
  }

  // Extract base language code (e.g., "en" from "en-US")
  const sourceLang = sourceLanguage.split("-")[0];
  const targetLang = targetLanguage.split("-")[0];

  if (sourceLang === targetLang) {
    return text;
  }

  try {
    // Use Google Translate API (free tier available)
    // For a production app, you'd want to use an API key
    // This uses the public Google Translate endpoint (may have rate limits)
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
    );

    if (!response.ok) {
      throw new Error("Translation API error");
    }

    const data = await response.json();
    
    // Parse the response - Google Translate returns an array
    if (Array.isArray(data) && data[0] && Array.isArray(data[0])) {
      const translatedText = data[0]
        .map((item: any[]) => item[0])
        .filter(Boolean)
        .join("");
      return translatedText || text;
    }

    return text;
  } catch (error) {
    console.error("Translation error:", error);
    // Fallback: return original text if translation fails
    return text;
  }
}

/**
 * Get language name from code
 */
export function getLanguageName(code: string): string {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return lang?.name || code;
}

