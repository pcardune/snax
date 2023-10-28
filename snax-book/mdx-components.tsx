import type { MDXComponents } from 'mdx/types';
import { SnaxEditor } from './components/SnaxEditor.jsx';
import Editor from './components/editor/Editor.jsx';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    code({ className, ...props }) {
      const match = /language-([\w-]+)/.exec(className || '');
      if (match) {
        switch (match[1]) {
          case 'snax':
            return <SnaxEditor>{props.children as string}</SnaxEditor>;
          case 'wat':
            return (
              <Editor value={(props.children as string).trim()} lang="wat" />
            );
          case 'snax-wat':
            return (
              <SnaxEditor
                showWAT
                runOnMount
                compilerOptions={{ includeRuntime: false }}
                // showRunResult={false}
              >
                {props.children as string}
              </SnaxEditor>
            );
        }
      }
      return <code className={className} {...props} />;
    },
    ...components,
  };
}
