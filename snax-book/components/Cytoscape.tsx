import cytoscape from 'cytoscape';
import { useCallback } from 'react';

type Props = React.ComponentPropsWithoutRef<'div'> & {
  cyConfig: any;
};
export default function Cytoscape(props: Props) {
  const { cyConfig, ...divProps } = props;
  let containerEl = useCallback(
    (node) => {
      if (node !== null) {
        cytoscape({ container: node, ...cyConfig });
      }
    },
    [cyConfig]
  );

  return <div ref={containerEl} {...divProps}></div>;
}
