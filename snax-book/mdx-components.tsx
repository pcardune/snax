import type { MDXComponents } from 'mdx/types';
import { SnaxEditor } from './components/SnaxEditor.jsx';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    code({ className, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      if (match && match[1] === 'snax') {
        return <SnaxEditor>{props.children as string}</SnaxEditor>;
      }
      return <code className={className} {...props} />;
    },
    ...components,
  };
}
