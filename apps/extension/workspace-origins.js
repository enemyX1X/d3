self.LIVIAWorkspaceOrigins = Object.freeze(['http://localhost:3000', 'http://127.0.0.1:3000']);
self.isLIVIAControlPage = (rawUrl) => {
	try {
		const url = new URL(rawUrl);
		return self.LIVIAWorkspaceOrigins.includes(url.origin) && (url.pathname === '/' || url.pathname === '/dashboard');
	} catch {
		return false;
	}
};
