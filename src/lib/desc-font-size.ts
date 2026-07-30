import { Mark, mergeAttributes } from "@tiptap/core";

export type DescFontSizeValue = "lg" | "xl";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    descFontSize: {
      setDescFontSize: (size: DescFontSizeValue) => ReturnType;
      unsetDescFontSize: () => ReturnType;
    };
  }
}

/** Named font-size mark → span.desc-size-lg | span.desc-size-xl (no inline styles). */
export const DescFontSize = Mark.create({
  name: "descFontSize",

  addAttributes() {
    return {
      size: {
        default: null as DescFontSizeValue | null,
        parseHTML: (element: HTMLElement) => {
          if (element.classList.contains("desc-size-xl")) return "xl";
          if (element.classList.contains("desc-size-lg")) return "lg";
          return null;
        },
        renderHTML: (attributes: { size?: DescFontSizeValue | null }) => {
          if (attributes.size === "xl") return { class: "desc-size-xl" };
          if (attributes.size === "lg") return { class: "desc-size-lg" };
          return {};
        }
      }
    };
  },

  parseHTML() {
    return [
      { tag: "span.desc-size-lg", attrs: { size: "lg" } },
      { tag: "span.desc-size-xl", attrs: { size: "xl" } }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setDescFontSize:
        (size: DescFontSizeValue) =>
        ({ commands }) =>
          commands.setMark(this.name, { size }),
      unsetDescFontSize:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name)
    };
  }
});
