import { useState } from "react";
import type { FormEvent } from "react";
import { client } from "../api/client";
import type { Repo } from "../api/client";
import { useNavigate } from "react-router-dom";

function RepositoriesPage() {
  const navigate = useNavigate();
  const [repoName, setRepoName] = useState("");
  const [repoId, setRepoId] = useState("");
  const [head, setHead] = useState("frontend-head");
  const [message, setMessage] = useState("Update from frontend");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCreateRepo(event: FormEvent) {
    event.preventDefault();
    if (!repoName.trim()) {
      return;
    }

    setError(null);
    setStatus("Creating repository...");
    try {
      const repo = await client.createRepo(repoName.trim());
      setSelectedRepo(repo);
      setRepoId(repo.repoId);
      setStatus(`Created repo ${repo.name}`);
      setRepoName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
      setStatus(null);
    }
  }

  async function onLoadRepo(event: FormEvent) {
    event.preventDefault();
    if (!repoId.trim()) {
      return;
    }

    setError(null);
    setStatus("Loading repository...");
    try {
      const repo = await client.getRepo(repoId.trim());
      setSelectedRepo(repo);
      setStatus(`Loaded repo ${repo.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setStatus(null);
    }
  }

  async function onUpdateRepo(event: FormEvent) {
    event.preventDefault();
    if (!repoId.trim()) {
      return;
    }

    setError(null);
    setStatus("Submitting update...");
    try {
      const updated = await client.updateRepo(repoId.trim(), head.trim(), message.trim());
      setStatus(`Update accepted. Version ${updated.version}`);
      const repo = await client.getRepo(repoId.trim());
      setSelectedRepo(repo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
      setStatus(null);
    }
  }

  return (
    <div className="p-6 text-white h-full overflow-y-auto bg-black">
      <h1 className="text-2xl font-semibold mb-4">Repository Actions</h1>
      <p className="text-sm text-gray-400 mb-6 break-all">Identity: {client.getPublicKey()}</p>

      <form onSubmit={onCreateRepo} className="mb-4 p-4 bg-[#171717] border border-[#2b2b2b]">
        <div className="text-sm text-gray-300 mb-2">Create Repository</div>
        <div className="flex gap-3">
          <input
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            placeholder="repo name"
            className="flex-1 bg-[#101010] border border-[#2c2c2c] px-3 py-2 outline-none"
          />
          <button type="submit" className="bg-white text-black px-4 py-2">Create</button>
        </div>
      </form>

      <form onSubmit={onLoadRepo} className="mb-4 p-4 bg-[#171717] border border-[#2b2b2b]">
        <div className="text-sm text-gray-300 mb-2">Load Repository</div>
        <div className="flex gap-3">
          <input
            value={repoId}
            onChange={(e) => setRepoId(e.target.value)}
            placeholder="repo id"
            className="flex-1 bg-[#101010] border border-[#2c2c2c] px-3 py-2 outline-none"
          />
          <button type="submit" className="bg-white text-black px-4 py-2">Load</button>
        </div>
      </form>

      <form onSubmit={onUpdateRepo} className="mb-4 p-4 bg-[#171717] border border-[#2b2b2b]">
        <div className="text-sm text-gray-300 mb-2">Submit Update</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input
            value={head}
            onChange={(e) => setHead(e.target.value)}
            placeholder="head"
            className="bg-[#101010] border border-[#2c2c2c] px-3 py-2 outline-none"
          />
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="message"
            className="bg-[#101010] border border-[#2c2c2c] px-3 py-2 outline-none"
          />
        </div>
        <button type="submit" className="bg-white text-black px-4 py-2">Update</button>
      </form>

      {status && <div className="text-green-400 mb-3">{status}</div>}
      {error && <div className="text-red-400 mb-3">{error}</div>}

      {selectedRepo && (
        <div className="p-4 bg-[#151515] border border-[#2a2a2a]">
          <div className="font-medium">{selectedRepo.name}</div>
          <div className="text-xs text-gray-400 break-all">repoId: {selectedRepo.repoId}</div>
          <div className="text-xs text-gray-400 break-all">owner: {selectedRepo.ownerPublicKey}</div>
          <div className="text-xs text-gray-400 break-all">leader: {selectedRepo.leaderNode || "unknown"}</div>
          <div className="text-xs text-gray-400">version: {selectedRepo.version}</div>
          <button
            onClick={() => navigate(`/repo/${selectedRepo.repoId}`)}
            className="mt-3 px-3 py-1.5 text-xs bg-white text-black"
        >
            Open Editor →
        </button>
        </div>
      )}
    </div>
  );
}

export default RepositoriesPage;