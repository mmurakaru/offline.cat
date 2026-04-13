declare namespace CSS {
  const paintWorklet: { addModule(url: string): Promise<void> };
}

if (typeof document !== "undefined" && "paintWorklet" in CSS) {
  CSS.paintWorklet.addModule("/header-highlight.js");
}
