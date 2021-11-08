import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';

const addUnderline = StateEffect.define<{ from: number; to: number }>();
const removeAllUnderlines = StateEffect.define();

const underlineField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(underlines, tr) {
    underlines = underlines.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addUnderline)) {
        underlines = underlines.update({
          add: [underlineMark.range(effect.value.from, effect.value.to)],
        });
      } else if (effect.is(removeAllUnderlines)) {
        underlines = Decoration.none;
      }
    }
    return underlines;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const underlineMark = Decoration.mark({ class: 'cm-underline' });

const underlineTheme = EditorView.baseTheme({
  '.cm-underline': { textDecoration: 'underline 3px red' },
});

export function underlineSection(view: EditorView, from: number, to: number) {
  const effects: StateEffect<unknown>[] = [addUnderline.of({ from, to })];

  if (!view.state.field(underlineField, false)) {
    effects.unshift(
      StateEffect.appendConfig.of([
        underlineField.init(() =>
          Decoration.set(underlineMark.range(from, to))
        ),
        underlineTheme,
      ])
    );
  }
  view.dispatch({ effects });
  return true;
}
export function removeUnderlines(view: EditorView) {
  view.dispatch({ effects: [removeAllUnderlines.of(null)] });
}
