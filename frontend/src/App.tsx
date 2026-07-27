import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import HomePage from "./pages/Home";
import SearchPage from "./pages/Search";
import RepositoriesPage from "./pages/Repo";
import RepoDetailPage from "./pages/RepoDetail";
import ProfilePage from "./pages/Profile";
import { client } from "./api/client";

const headerItems = [
    { name: "Home", path: "/" },
    { name: "Search", path: "/search" },
    { name: "Repositories", path: "/repositories" },
    { name: "Profile", path: "/profile" },
];

function App() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;
    const [connected, setConnected] = useState(client.isConnected());
    const [authPending, setAuthPending] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const shortKey = useMemo(() => `${client.getPublicKey().slice(0, 12)}...`, []);

    async function connectIdentity() {
        setAuthPending(true);
        setAuthError(null);
        try {
            await client.connect();
            setConnected(true);
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : "Failed to authenticate identity");
        } finally {
            setAuthPending(false);
        }
    }

    function disconnectIdentity() {
        client.disconnect();
        setConnected(false);
        setAuthError(null);
    }

    // dynamic repo detail route
    const repoDetailMatch = currentPath.match(/^\/repo\/(.+)$/);
    const repoDetailId = repoDetailMatch ? repoDetailMatch[1] : null;

    function renderPage() {
        if (repoDetailId) {
            return <RepoDetailPage repoId={repoDetailId} />;
        }
        switch (currentPath) {
            case "/": return <HomePage />;
            case "/search": return <SearchPage />;
            case "/repositories": return <RepositoriesPage />;
            case "/profile": return <ProfilePage />;
            default: return <HomePage />;
        }
    }

    return (
        <div className="bg-black h-screen w-screen flex flex-col items-center">
            {/* Top bar */}
            <div className="bg-transparent shrink-0 px-6 h-[10%] min-h-20 w-screen flex flex-row justify-between items-center">
                <div onClick={() => navigate("/")} className="text-4xl text-white cursor-pointer">
                    Juncture.
                </div>

                <div className="flex-row flex min-w-50 justify-end space-x-2 items-center">
                    <button
                        type="button"
                        onClick={() => navigate("/profile")}
                        className="flex flex-col items-end cursor-pointer text-right"
                    >
                        <div className="text text-white">Anonymous Persona</div>
                        <div className="text-xs font-light text-white">{shortKey}</div>
                    </button>

                    <img
                        src="https://api.dicebear.com/7.x/avataaars/svg?seed=Me"
                        className="h-10 w-10 rounded-full cursor-pointer bg-amber-100"
                        onClick={() => navigate("/profile")}
                    />

                    <button
                        onClick={connected ? disconnectIdentity : connectIdentity}
                        disabled={authPending}
                        className="ml-2 px-3 py-1.5 text-xs bg-white text-black disabled:opacity-50"
                    >
                        {connected ? "Disconnect" : authPending ? "Connecting..." : "Connect"}
                    </button>
                </div>
            </div>

            {authError && (
                <div className="w-full px-6 text-red-400 text-xs pb-1">{authError}</div>
            )}

            {/* Nav */}
            <div className="w-screen shrink-0 h-[2.5%] min-h-12 bg-[#1f1f1f] flex flex-row items-center">
                {headerItems.map((item) => {
                    const active = currentPath === item.path ? "text-white" : "text-gray-400 font-light";
                    return (
                        <div
                            key={item.path}
                            onClick={() => navigate(item.path)}
                            className={`px-2.5 cursor-pointer text-lg ml-10 ${active}`}
                        >
                            {item.name}
                        </div>
                    );
                })}
            </div>

            {/* Page */}
            <div className="h-[85%] overflow-y-hidden w-full">
                {renderPage()}
            </div>
        </div>
    );
}

export default App;