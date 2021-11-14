import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, Extension } from '@codemirror/state';
import type { StyleSpec } from 'style-mod';
export class TextMarker {
  private readonly addUnderline =
    StateEffect.define<{ from: number; to: number }>();
  private readonly removeAllUnderlines = StateEffect.define();

  private readonly underlineField = StateField.define<DecorationSet>({
    create: () => {
      return Decoration.none;
    },
    update: (underlines, tr) => {
      underlines = underlines.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(this.addUnderline)) {
          underlines = underlines.update({
            add: [this.mark.range(effect.value.from, effect.value.to)],
          });
        } else if (effect.is(this.removeAllUnderlines)) {
          underlines = Decoration.none;
        }
      }
      return underlines;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  private readonly mark: Decoration;
  private readonly theme: Extension;

  constructor(className: string, style: StyleSpec) {
    this.mark = Decoration.mark({ class: className });
    this.theme = EditorView.baseTheme({
      ['.' + className]: style,
    });
  }

  markSection(view: EditorView, from: number, to: number) {
    const effects: StateEffect<unknown>[] = [
      this.addUnderline.of({ from, to }),
    ];

    if (!view.state.field(this.underlineField, false)) {
      effects.unshift(
        StateEffect.appendConfig.of([
          this.underlineField.init(() =>
            Decoration.set(this.mark.range(from, to))
          ),
          this.theme,
        ])
      );
    }
    view.dispatch({ effects });
    return true;
  }

  unmarkAll(view: EditorView) {
    view.dispatch({ effects: [this.removeAllUnderlines.of(null)] });
  }
}
