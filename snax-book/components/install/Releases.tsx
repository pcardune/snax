import { Octokit, RestEndpointMethodTypes } from '@octokit/rest';
import { useEffect, useState } from 'react';

const octokit = new Octokit();

function useArtifacts() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [response, setResponse] = useState<
    | null
    | RestEndpointMethodTypes['actions']['listArtifactsForRepo']['response']
  >(null);
  useEffect(() => {
    octokit.rest.actions
      .listArtifactsForRepo({
        owner: 'pcardune',
        repo: 'snax',
      })
      .catch((err) => {
        setError(err);
      })
      .then((resp) => {
        setLoading(false);
        console.log(resp);
        resp && setResponse(resp);
      });
  }, []);
  return { loading, response, error };
}

export const Releases = ({ artifactName }: { artifactName?: string }) => {
  const { loading, response, error } = useArtifacts();
  if (loading) {
    return <p>Loading...</p>;
  }
  if (error) {
    return <p>Failed to load artifacts: {String(error)}</p>;
  }
  const artifacts =
    response?.data.artifacts.filter(
      (a) => !a.expired && (!artifactName || a.name === artifactName)
    ) ?? [];

  return (
    <table>
      <thead>
        <tr>
          <th>Artifact</th>
          <th>Branch</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {artifacts.map((artifact) => (
          <tr key={artifact.id}>
            <td>
              <a
                href={`https://github.com/pcardune/snax/actions/runs/${artifact.workflow_run?.id}`}
              >
                {artifact.name}
              </a>
            </td>
            <td>{artifact.workflow_run?.head_branch}</td>
            <td>
              {artifact.created_at &&
                new Date(artifact.created_at).toLocaleString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
