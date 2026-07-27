import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "../api/client";
import type { Repo } from "../api/client";

function HomePage() {
  const navigate = useNavigate();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState<boolean>(true);
  const [reposError, setReposError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadRepos() {
      setReposLoading(true);
      setReposError(null);
      try {
        const data = await client.listRepos();
        if (active) {
          setRepos(data.slice(0, 8));
        }
      } catch (err) {
        if (active) {
          setReposError(err instanceof Error ? err.message : "Failed to load repositories");
        }
      } finally {
        if (active) {
          setReposLoading(false);
        }
      }
    }

    loadRepos();
    return () => {
      active = false;
    };
  }, []);

  const openRepo = (repoId: string) => {
    navigate(`/repo/${repoId}`);
  };

  return (
    <div className="p-6 h-full w-full overflow-y-auto bg-black text-white">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-gray-500">Workspace</div>
          <h1 className="text-3xl font-semibold mt-2">Repository dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Open a repository, inspect its current version, or jump straight into the editor.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/search")}
            className="px-4 py-2 text-sm bg-white text-black"
          >
            Search repositories
          </button>
          <button
            type="button"
            onClick={() => navigate("/repositories")}
            className="px-4 py-2 text-sm border border-[#2a2a2a] text-white"
          >
            Create or load
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.8fr)]">
        <section className="rounded-2xl border border-[#242424] bg-[#141414] p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Recent repositories</h2>
              <p className="text-sm text-gray-500">The latest repos available in the cluster.</p>
            </div>
            <div className="text-xs text-gray-500">{repos.length} total</div>
          </div>

          {reposLoading && <div className="text-sm text-gray-400">Loading repositories...</div>}
          {reposError && <div className="text-sm text-red-400">{reposError}</div>}

          {!reposLoading && !reposError && repos.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#2b2b2b] p-6 text-sm text-gray-400">
              No repositories yet. Create one from the Repositories page to get started.
            </div>
          )}

          {!reposLoading && !reposError && repos.length > 0 && (
            <div className="space-y-3">
              {repos.map((repo) => (
                <article
                  key={repo.repoId}
                  className="rounded-xl border border-[#242424] bg-[#191919] p-4 transition-colors hover:border-[#3a3a3a]"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-base font-medium text-white">{repo.name}</div>
                      <div className="mt-1 text-xs text-gray-500 break-all">{repo.repoId}</div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                        <span>Version {repo.version}</span>
                        <span>Leader {repo.leaderNode || "unknown"}</span>
                        <span>Owner {repo.ownerPublicKey.slice(0, 14)}...</span>
                        <span>
                          Updated {repo.updatedAt ? new Date(repo.updatedAt).toLocaleDateString() : "unknown"}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openRepo(repo.repoId)}
                      className="self-start px-3 py-1.5 text-xs bg-white text-black"
                    >
                      Open editor
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-[#242424] bg-[#141414] p-5">
          <h2 className="text-lg font-medium">Quick actions</h2>
          <div className="mt-4 space-y-3 text-sm">
            <button
              type="button"
              onClick={() => navigate("/repositories")}
              className="w-full rounded-xl border border-[#2a2a2a] px-4 py-3 text-left text-gray-200 hover:border-[#444]"
            >
              Create a repository
            </button>
            <button
              type="button"
              onClick={() => navigate("/search")}
              className="w-full rounded-xl border border-[#2a2a2a] px-4 py-3 text-left text-gray-200 hover:border-[#444]"
            >
              Search the network
            </button>
            <button
              type="button"
              onClick={() => navigate("/profile")}
              className="w-full rounded-xl border border-[#2a2a2a] px-4 py-3 text-left text-gray-200 hover:border-[#444]"
            >
              View profile and identity
            </button>
          </div>

          <div className="mt-6 rounded-xl bg-[#101010] p-4 text-sm text-gray-400">
            This dashboard now reflects live repository data only. There are no mock feed items or dummy cards.
          </div>
        </aside>
      </div>
    </div>
  );
}

export default HomePage