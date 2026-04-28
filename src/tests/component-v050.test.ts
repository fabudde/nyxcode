import { describe, it } from "node:test";
import { Lexer } from "../lexer.js";
import { Parser } from "../parser.js";
import assert from "node:assert";
import { Compiler } from "../compiler.js";

function compile(source: string): string {
  const tokens = new Lexer(source).tokenize();
  const ast = new Parser(tokens).parse();

  return new Compiler().compile(ast).html;
}

describe("v0.50 Component System v2", () => {
  describe("Typed Props", () => {
    it("parses component with typed props", () => {
      const result = compile(`
component Counter(label: string, count: number = 0) {
  div "{label}: {count}"
}
page / {
  Counter label="Clicks" count="5"
}
`);
      assert.ok(result.includes("Clicks"));
      assert.ok(result.includes("5"));
    });

    it("coerces number props", () => {
      const result = compile(`
component Score(points: number = 0) {
  span "{points}"
}
page / {
  Score points="42"
}
`);
      assert.ok(result.includes("42"));
    });

    it("coerces boolean props", () => {
      const result = compile(`
component Toggle(active: boolean = false) {
  span "{active}"
}
page / {
  Toggle active="true"
}
`);
      assert.ok(result.includes("true"));
    });

    it("uses default value when prop not provided", () => {
      const result = compile(`
component Badge(label: string = "default") {
  span "{label}"
}
page / {
  Badge
}
`);
      assert.ok(result.includes("default"));
    });
  });

  describe("Named Slots", () => {
    it("renders default slot", () => {
      const result = compile(`
component Card {
  div {
    slot
  }
}
page / {
  Card {
    p "Hello inside card"
  }
}
`);
      assert.ok(result.includes("Hello inside card"));
    });

    it("renders named slots", () => {
      const result = compile(`
component Layout {
  header {
    slot name="header"
  }
  main {
    slot
  }
  footer {
    slot name="footer"
  }
}
page / {
  Layout {
    div slot="header" "My Header"
    p "Main content"
    div slot="footer" "My Footer"
  }
}
`);
      assert.ok(result.includes("My Header"));
      assert.ok(result.includes("Main content"));
      assert.ok(result.includes("My Footer"));
    });

    it("renders slot default content when no children provided", () => {
      const result = compile(`
component Panel {
  div {
    slot name="title" {
      h2 "Default Title"
    }
    slot
  }
}
page / {
  Panel {
    p "Body only"
  }
}
`);
      assert.ok(result.includes("Default Title"));
      assert.ok(result.includes("Body only"));
    });
  });

  describe("Event Forwarding", () => {
    it("emit in component handler works", () => {
      const result = compile(`
component Button(label: string) {
  button on:click { emit click } "{label}"
}
page / {
  Button label="Save"
}
`);
      assert.ok(result.includes("Save"));
    });
  });
});
