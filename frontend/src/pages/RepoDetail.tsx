import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "../api/client";
import type { GitCommit, GitFile, Repo } from "../api/client";

function RepoDetailPage({ repoId }: { repoId: string }) {
    const navigate = useNavigate();
    const [repo, setRepo] = useState<Repo | null>(null);
    const [tree, setTree] = useState<string[]>([]);
    const [log, setLog] = useState<GitCommit[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [editContent, setEditContent] = useState<string>("");
    const [commitMessage, setCommitMessage] = useState("");
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [newFilePath, setNewFilePath] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void loadRepoData();
    }, [repoId]);

    async function loadRepoData() {
        setLoading(true);
        setError(null);
        setStatus(null);
        try {
            const [repoData, treeData, logData] = await Promise.all([
                client.getRepo(repoId),
                client.getTree(repoId),
                client.getLog(repoId),
            ]);
            setRepo(repoData);
            setTree(treeData);
            setLog(logData);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load repo");
            setRepo(null);
            setTree([]);
            setLog([]);
        } finally {
            setLoading(false);
        }
    }

    async function loadFile(path: string) {
        try {
            const file = await client.getFile(repoId, path);
            setSelectedFile(path);
            setNewFilePath("");
            setEditContent(file.content);
            setStatus(null);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load file");
        }
    }

    function startNewFile() {
        setSelectedFile(null);
        setNewFilePath("");
        setEditContent("");
        setStatus(null);
        setError(null);
    }

    function handleNewFilePathChange(value: string) {
        setSelectedFile(null);
        setNewFilePath(value);
    }

    async function commitChanges() {
        if (!commitMessage.trim()) {
            setError("Commit message required");
            return;
        }

        const targetPath = selectedFile || newFilePath.trim();
        if (!targetPath) {
            setError("Select a file or enter a new file path");
            return;
        }

        const files: GitFile[] = [{ path: targetPath, content: editContent }];

        setError(null);
        setStatus("Committing...");
        try {
            const result = await client.pushFiles(repoId, files, commitMessage);
            setStatus(`Committed: ${result.sha.slice(0, 8)}`);
            setCommitMessage("");
            setNewFilePath("");
            setSelectedFile(null);
            setEditContent("");
            await loadRepoData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Commit failed");
            setStatus(null);
        }
    }

    if (loading) return <div className="text-gray-400 p-6">Loading...</div>;

    return (
        <div className="flex h-full text-white bg-black">
            {/* File tree */}
            <aside className="w-56 bg-[#1a1a1a] border-r border-[#2b2b2b] p-4 overflow-y-auto shrink-0">
                <div className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Files</div>
                <button
                    type="button"
                    onClick={startNewFile}
                    className="mb-3 w-full rounded border border-[#2b2b2b] px-3 py-2 text-left text-xs text-gray-300 hover:border-[#444]"
                >
                    New file
                </button>
                {tree.length === 0 && (
                    <div className="text-xs text-gray-500">No files yet</div>
                )}
                {tree.map((file) => (
                    <button
                        type="button"
                        key={file}
                        onClick={() => loadFile(file)}
                        className={`block w-full text-left text-sm py-1 px-2 rounded truncate ${
                            selectedFile === file
                                ? "bg-[#2a2a2a] text-white"
                                : "text-gray-400 hover:text-white"
                        }`}
                    >
                        {file}
                    </button>
                ))}
            </aside>

            {/* Editor */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="border-b border-[#2b2b2b] px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wider text-gray-500">
                            <button type="button" onClick={() => navigate("/")} className="hover:text-white">Home</button>
                            <span className="mx-2 text-gray-600">/</span>
                            <button type="button" onClick={() => navigate("/repositories")} className="hover:text-white">Repositories</button>
                            <span className="mx-2 text-gray-600">/</span>
                            <span className="text-white">{repo?.name || repoId}</span>
                        </div>
                        <div className="mt-1 text-sm text-gray-300">
                            <span className="font-medium text-white">{repo?.name || repoId}</span>
                            <span className="ml-3 text-xs text-gray-500">Version {repo?.version ?? "—"}</span>
                            <span className="ml-3 text-xs text-gray-500 break-all">Owner {repo?.ownerPublicKey?.slice(0, 16) || "unknown"}...</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate("/repositories")}
                            className="px-3 py-1.5 text-xs border border-[#2b2b2b] text-gray-300 hover:border-[#444]"
                        >
                            Back to repositories
                        </button>
                        <button
                            type="button"
                            onClick={startNewFile}
                            className="px-3 py-1.5 text-xs bg-white text-black"
                        >
                            New file
                        </button>
                    </div>
                </div>

                <div className="border-b border-[#2b2b2b] px-4 py-2 text-sm text-gray-400 flex items-center justify-between gap-3">
                    <span>
                        {selectedFile
                            ? `Editing ${selectedFile}`
                            : newFilePath.trim()
                                ? `Creating ${newFilePath.trim()}`
                                : "Select a file or start a new one"}
                    </span>
                    <input
                        value={newFilePath}
                        onChange={(e) => handleNewFilePathChange(e.target.value)}
                        placeholder="New file path e.g. src/index.js"
                        className="bg-[#111] border border-[#2b2b2b] px-2 py-1 text-xs w-64 outline-none"
                    />
                </div>

                <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex-1 bg-[#111] text-gray-200 font-mono text-sm p-4 outline-none resize-none"
                    placeholder={selectedFile ? "Edit file content..." : "Write new file content..."}
                />

                <div className="border-t border-[#2b2b2b] p-3 flex gap-3 items-center">
                    <input
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Commit message"
                        className="flex-1 bg-[#111] border border-[#2b2b2b] px-3 py-1.5 text-sm outline-none"
                    />
                    <button
                        onClick={commitChanges}
                        className="bg-white text-black px-4 py-1.5 text-sm"
                    >
                        Commit changes
                    </button>
                </div>

                {status && <div className="px-4 py-2 text-green-400 text-xs">{status}</div>}
                {error && <div className="px-4 py-2 text-red-400 text-xs">{error}</div>}
            </div>

            {/* Commit log */}
            <aside className="w-64 bg-[#1a1a1a] border-l border-[#2b2b2b] p-4 overflow-y-auto shrink-0">
                <div className="text-xs text-gray-400 mb-3 uppercase tracking-wider">Commits</div>
                {log.length === 0 && (
                    <div className="text-xs text-gray-500">No commits yet</div>
                )}
                {log.map((commit) => (
                    <div key={commit.sha} className="mb-3 border-b border-[#2b2b2b] pb-3">
                        <div className="text-xs font-mono text-gray-400">{commit.sha.slice(0, 8)}</div>
                        <div className="text-sm text-white mt-1">{commit.message}</div>
                        <div className="text-xs text-gray-500 mt-1">
                            {new Date(commit.timestamp * 1000).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </aside>
        </div>
    );
}

export default RepoDetailPage;