import { basicSetup, EditorView } from "codemirror";
import { EditorState } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { json as jsonLang } from "@codemirror/lang-json";

const KEYWORDS = new Set([
  "module", "entity", "action", "invariant", "edge_cases",
  "requires", "ensures", "properties", "use",
  "forall", "exists", "old", "when",
  "true", "false", "null",
]);

const TYPES = new Set([
  "UUID", "String", "Int", "Decimal", "Bool", "DateTime",
  "CurrencyCode", "Email", "URL",
  "List", "Set", "Map",
]);

const intentLanguage = StreamLanguage.define({
  startState() {
    return {};
  },
  token(stream) {
    if (stream.eatSpace()) return null;

    // Doc comment: ---
    if (stream.match("---")) {
      stream.skipToEnd();
      return "docComment";
    }

    // Line comment: //
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }

    // Strings
    if (stream.match('"')) {
      while (!stream.eol()) {
        if (stream.next() === '"') break;
      }
      return "string";
    }

    // Numbers
    if (stream.match(/^-?\d+(\.\d+)?/)) {
      return "number";
    }

    // Multi-char operators (must come before single-char)
    if (stream.match("=>") || stream.match("==") || stream.match("!=") ||
        stream.match(">=") || stream.match("<=") || stream.match("&&") ||
        stream.match("||")) {
      return "operator";
    }

    // Single-char operators
    if (stream.match(/^[><!+\-]/)) {
      return "operator";
    }

    // Identifiers and keywords
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      if (TYPES.has(word)) return "typeName";
      if (word[0] >= "A" && word[0] <= "Z") return "typeName";
      return "variableName";
    }

    stream.next();
    return null;
  },
});

const playgroundTheme = EditorView.theme({
  "&": {
    backgroundColor: "#1a1b26",
    color: "#c0caf5",
  },
  ".cm-content": {
    caretColor: "#7aa2f7",
  },
  ".cm-gutters": {
    backgroundColor: "#1a1b26",
    color: "#565f89",
    borderRight: "1px solid #3b4261",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#292e42",
    color: "#c0caf5",
  },
  ".cm-activeLine": {
    backgroundColor: "#292e42",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "rgba(122, 162, 247, 0.2)",
  },
  ".cm-cursor": {
    borderLeftColor: "#7aa2f7",
  },
}, { dark: true });

export function createEditor(container, initialValue, onChange) {
  return new EditorView({
    state: EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        intentLanguage,
        playgroundTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
    parent: container,
  });
}

export function createJsonEditor(container, initialValue, onChange) {
  return new EditorView({
    state: EditorState.create({
      doc: initialValue,
      extensions: [
        basicSetup,
        jsonLang(),
        playgroundTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(update.state.doc.toString());
          }
        }),
      ],
    }),
    parent: container,
  });
}

export function setEditorValue(view, value) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
  });
}
