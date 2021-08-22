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

## Grammar For Numbers

<script>
  nfaExplore.render.GrammarPlayground({
    initialGrammar: nfaExplore.grammars.numbers,
    initialContent:`101001`,
  });
</script>
