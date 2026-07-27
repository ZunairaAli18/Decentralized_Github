import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { client } from "../api/client";
import type { Repo } from "../api/client";

function ProfilePage() {
	const navigate = useNavigate();
	const [repos, setRepos] = useState<Repo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;

		async function loadProfile() {
			setLoading(true);
			setError(null);
			try {
				const data = await client.listRepos(client.getPublicKey());
				if (active) {
					setRepos(data);
				}
			} catch (err) {
				if (active) {
					setError(err instanceof Error ? err.message : "Failed to load profile");
				}
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		}

		void loadProfile();
		return () => {
			active = false;
		};
	}, []);

	function disconnect() {
		client.disconnect();
		navigate("/");
	}

	return (
		<div className="h-full overflow-y-auto bg-black p-6 text-white">
			<div className="mb-6 flex flex-col gap-2">
				<div className="text-xs uppercase tracking-[0.35em] text-gray-500">Identity</div>
				<h1 className="text-3xl font-semibold">Profile</h1>
				<p className="max-w-2xl text-sm text-gray-400">
					Manage the current identity, inspect owned repositories, and disconnect when you want to switch keys.
				</p>
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
				<section className="rounded-2xl border border-[#242424] bg-[#141414] p-5">
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="text-sm text-gray-400">Public key</div>
							<div className="mt-2 break-all font-mono text-sm text-white">{client.getPublicKey()}</div>
							<div className="mt-3 text-xs text-gray-500">
								{client.isConnected() ? "Connected identity" : "Identity is not connected"}
							</div>
						</div>

						<button
							type="button"
							onClick={disconnect}
							className="px-3 py-1.5 text-xs bg-white text-black"
						>
							Disconnect
						</button>
					</div>

					<div className="mt-6 rounded-xl border border-[#242424] bg-[#191919] p-4">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="text-sm font-medium">Owned repositories</div>
								<div className="text-xs text-gray-500">Repositories created by this identity.</div>
							</div>
							<div className="text-xs text-gray-500">{repos.length} repos</div>
						</div>

						{loading && <div className="mt-4 text-sm text-gray-400">Loading repositories...</div>}
						{error && <div className="mt-4 text-sm text-red-400">{error}</div>}
						{!loading && !error && repos.length === 0 && (
							<div className="mt-4 rounded-xl border border-dashed border-[#2b2b2b] p-4 text-sm text-gray-400">
								No repositories owned by this identity yet.
							</div>
						)}

						{!loading && !error && repos.length > 0 && (
							<div className="mt-4 space-y-3">
								{repos.map((repo) => (
									<article key={repo.repoId} className="rounded-xl border border-[#242424] bg-[#151515] p-4">
										<div className="flex items-start justify-between gap-3">
											<div>
												<div className="font-medium text-white">{repo.name}</div>
												<div className="mt-1 text-xs text-gray-500 break-all">{repo.repoId}</div>
												<div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
													<span>Version {repo.version}</span>
													<span>Leader {repo.leaderNode || "unknown"}</span>
												</div>
											</div>

											<button
												type="button"
												onClick={() => navigate(`/repo/${repo.repoId}`)}
												className="px-3 py-1.5 text-xs bg-white text-black"
											>
												Open editor
											</button>
										</div>
									</article>
								))}
							</div>
						)}
					</div>
				</section>

				<aside className="rounded-2xl border border-[#242424] bg-[#141414] p-5">
					<h2 className="text-lg font-medium">Navigation</h2>
					<div className="mt-4 space-y-3 text-sm">
						<button
							type="button"
							onClick={() => navigate("/")}
							className="w-full rounded-xl border border-[#2a2a2a] px-4 py-3 text-left text-gray-200 hover:border-[#444]"
						>
							Back to dashboard
						</button>
						<button
							type="button"
							onClick={() => navigate("/repositories")}
							className="w-full rounded-xl border border-[#2a2a2a] px-4 py-3 text-left text-gray-200 hover:border-[#444]"
						>
							Create or load repository
						</button>
						<button
							type="button"
							onClick={() => navigate("/search")}
							className="w-full rounded-xl border border-[#2a2a2a] px-4 py-3 text-left text-gray-200 hover:border-[#444]"
						>
							Search repositories
						</button>
					</div>
				</aside>
			</div>
		</div>
	);
}

export default ProfilePage;
