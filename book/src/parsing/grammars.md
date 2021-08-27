<script src="/main.js"></script>

# Grammars

## Standard Expression Grammar

Here is a standard expression grammar showing how operator
precedence works.

<script>
  nfaExplore.render.GrammarPlayground({
    initialGrammar: nfaExplore.grammars.expressions,
    initialContent:`3+4`,
  });
</script>

## Right Recursive Grammar

The above grammar was left recursive, but it can be rewritten
as right recursive:

<script>
  nfaExplore.render.GrammarPlayground({
    initialGrammar: nfaExplore.grammars.expressionLL1,
    initialContent:`3+4`,
  });
</script>

## Grammar For Numbers

<script>
  nfaExplore.render.GrammarPlayground({
    initialGrammar: nfaExplore.grammars.numbers,
    initialContent:`101001`,
  });
</script>

<script>
  nfaExplore.render.GrammarsPage({});
</script>
