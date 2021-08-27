import { grammar } from '../../dist/snax/snax-parser';

export function SnaxGrammar() {
  return (
    <div>
      <pre>
        <code>{grammar.toString()}</code>
      </pre>
    </div>
  );
}
