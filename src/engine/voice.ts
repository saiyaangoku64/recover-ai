/**
 * Browser TTS — speaks Hinglish recovery messages using Web Speech API.
 * Zero cost, zero API, works in Chrome/Edge/Safari.
 */

export function isSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
}

export function speakHinglish(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Speech Synthesis not supported'));
      return;
    }

    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);

    // Try to find a Hindi voice, fallback to English
    const voices = window.speechSynthesis.getVoices();
    const hindiVoice = voices.find(v => v.lang.startsWith('hi'));
    const englishIndiaVoice = voices.find(v => v.lang === 'en-IN');

    if (hindiVoice) {
      utterance.voice = hindiVoice;
      utterance.lang = 'hi-IN';
    } else if (englishIndiaVoice) {
      utterance.voice = englishIndiaVoice;
      utterance.lang = 'en-IN';
    } else {
      utterance.lang = 'en-IN';
    }

    utterance.rate = 0.9;
    utterance.pitch = 1.0;

    utterance.onend = () => { resolve(); };
    utterance.onerror = (e) => { reject(e); };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Generate a Hinglish recovery message for a payment.
 */
export function buildHinglishMessage(
  customerName: string,
  amount: number,
  subscription: string,
  failureReason: string,
): string {
  const name = customerName.split(' ')[0]; // first name
  const amtStr = `₹${amount.toLocaleString('en-IN')}`;
  const sub = subscription.replace(/_/g, ' ');
  const reason = failureReason.replace(/_/g, ' ');

  const templates = [
    `Namaste ${name} ji! Aapka ${amtStr} ka ${sub} payment ${reason} ki wajah se fail ho gaya tha. Koi baat nahi, hum aapke liye ek secure payment link bhej rahe hain. Bas ek click mein payment complete ho jayega. Dhanyavaad!`,
    `Hi ${name} ji, aapka ${sub} ka ${amtStr} ka payment abhi process nahi ho paya. Yeh ${reason} ki wajah se hua hai. Aapki suvidha ke liye humne ek quick payment link WhatsApp pe bhej diya hai. Please check karein.`,
    `${name} ji, aapke ${sub} subscription ka ${amtStr} payment pending hai. Failure reason: ${reason}. Iske liye humne ek one-click Razorpay link share kiya hai. Payment complete karne mein bas 10 seconds lagenge!`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}
