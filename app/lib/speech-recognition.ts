export function isSpeechRecognitionAvailable(): boolean {
  return (
    "webkitSpeechRecognition" in globalThis || "SpeechRecognition" in globalThis
  );
}

export function startDictation(
  onResult: (text: string) => void,
  onEnd: () => void,
): () => void {
  // biome-ignore lint/suspicious/noExplicitAny: Web Speech API types vary across browsers
  const SpeechRecognitionClass =
    (globalThis as any).SpeechRecognition ??
    (globalThis as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    onEnd();
    return () => {};
  }

  const recognition = new SpeechRecognitionClass();
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event: {
    resultIndex: number;
    results: {
      length: number;
      [index: number]: { [index: number]: { transcript: string } };
    };
  }) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    onResult(transcript);
  };

  recognition.onend = () => {
    onEnd();
  };

  recognition.onerror = () => {
    onEnd();
  };

  recognition.start();

  return () => {
    recognition.stop();
  };
}
