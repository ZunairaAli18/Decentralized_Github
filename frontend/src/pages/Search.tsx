import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "../api/client";
import type { Repo } from "../api/client";

function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const repos = await client.searchRepos(query.trim());
      setResults(repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  function openRepo(repoId: string) {
    navigate(`/repo/${repoId}`);
  }

  return (
    <div className="h-full overflow-y-auto bg-black p-6 text-white">
      <div className="mb-6 flex flex-col gap-2">
        <div className="text-xs uppercase tracking-[0.35em] text-gray-500">Discovery</div>
        <h1 className="text-3xl font-semibold">Search repositories</h1>
        <p className="max-w-2xl text-sm text-gray-400">
          Search by name, repo id, or owner key and open the matching repository directly.
        </p>
        <p className="text-xs text-gray-500 break-all">Identity: {client.getPublicKey()}</p>
      </div>

      <form onSubmit={onSearch} className="flex gap-3 mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by repo name"
          className="flex-1 bg-[#1b1b1b] border border-[#2c2c2c] px-3 py-2 outline-none"
        />
        <button
          type="submit"
          className="bg-white text-black px-4 py-2"
          disabled={loading}
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {error && <div className="text-red-400 mb-4">{error}</div>}
      {!loading && query.trim() && results.length === 0 && !error && (
        <div className="mb-4 rounded-xl border border-dashed border-[#2b2b2b] p-4 text-sm text-gray-400">
          No repositories matched “{query.trim()}”.
        </div>
      )}
      {!query.trim() && (
        <div className="mb-4 text-sm text-gray-500">
          Start typing to search the live repository list.
        </div>
      )}

      <div className="space-y-3">
        {results.map((repo) => (
          <article
            key={repo.repoId}
            className="rounded-xl border border-[#2a2a2a] bg-[#181818] p-4 transition-colors hover:border-[#444]"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="font-medium">{repo.name}</div>
                <div className="text-xs text-gray-400 break-all">repoId: {repo.repoId}</div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                  <span>Owner {repo.ownerPublicKey.slice(0, 14)}...</span>
                  <span>Version {repo.version}</span>
                  <span>Leader {repo.leaderNode || "unknown"}</span>
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
    </div>
  );
}

export default SearchPage;