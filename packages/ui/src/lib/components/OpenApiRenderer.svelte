<script lang="ts">
	interface Props {
		nodeId: string;
		anchor?: string;
	}

	let { nodeId, anchor }: Props = $props();

	// Minimal OpenAPI 3.x types
	type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace';
	interface Parameter {
		name: string;
		in: string;
		required?: boolean;
		description?: string;
		schema?: Record<string, unknown>;
	}
	interface MediaType {
		schema?: Record<string, unknown>;
		example?: unknown;
	}
	interface Response {
		description?: string;
		content?: Record<string, MediaType>;
	}
	interface Operation {
		operationId?: string;
		summary?: string;
		description?: string;
		tags?: string[];
		parameters?: Parameter[];
		requestBody?: { description?: string; required?: boolean; content?: Record<string, MediaType> };
		responses?: Record<string, Response>;
	}
	interface Schema {
		type?: string;
		description?: string;
		properties?: Record<string, Record<string, unknown>>;
		required?: string[];
		enum?: unknown[];
		items?: Record<string, unknown>;
		allOf?: Record<string, unknown>[];
		oneOf?: Record<string, unknown>[];
		anyOf?: Record<string, unknown>[];
		$ref?: string;
	}
	interface OpenApiSpec {
		openapi?: string;
		swagger?: string;
		info?: { title?: string; version?: string; description?: string };
		servers?: { url: string; description?: string }[];
		paths?: Record<string, Record<string, unknown>>;
		components?: { schemas?: Record<string, Schema> };
		tags?: { name: string; description?: string }[];
	}

	const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

	let spec = $state<OpenApiSpec | null>(null);
	let loading = $state(true);
	let loadError = $state('');

	// Track collapsed state: operationKey → boolean
	let collapsed = $state<Record<string, boolean>>({});

	$effect(() => {
		loadSpec(nodeId);
	});

	async function loadSpec(id: string) {
		loading = true;
		loadError = '';
		spec = null;
		try {
			const res = await fetch(`/api/openapi/${id}`);
			if (!res.ok) throw new Error(res.statusText);
			const data = await res.json();
			spec = data.spec as OpenApiSpec;
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to load spec';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!loading && anchor && spec) {
			const el = document.getElementById(anchor.replace('#', ''));
			if (el) el.scrollIntoView({ behavior: 'smooth' });
		}
	});

	function anchorId(path: string, method: string, operation: Operation): string {
		if (operation.operationId) return operation.operationId;
		return `/paths${path.replace(/\//g, '~1')}/${method}`;
	}

	function schemaAnchorId(name: string): string {
		return `/components/schemas/${name}`;
	}

	function toggle(key: string) {
		collapsed[key] = !collapsed[key];
	}

	function isCollapsed(key: string): boolean {
		return collapsed[key] ?? false;
	}

	interface TagGroup {
		tag: string;
		description?: string;
		operations: { path: string; method: HttpMethod; operation: Operation }[];
	}

	function groupByTag(paths: Record<string, Record<string, unknown>>): TagGroup[] {
		const groups: Record<string, TagGroup> = {};
		const order: string[] = [];

		for (const [path, methods] of Object.entries(paths)) {
			for (const method of HTTP_METHODS) {
				const op = methods[method] as Operation | undefined;
				if (!op) continue;
				const tags = op.tags?.length ? op.tags : ['Other'];
				const tag = tags[0];
				if (!groups[tag]) {
					groups[tag] = { tag, operations: [] };
					order.push(tag);
				}
				groups[tag].operations.push({ path, method, operation: op });
			}
		}

		// Merge tag descriptions from spec.tags
		if (spec?.tags) {
			for (const t of spec.tags) {
				if (groups[t.name]) groups[t.name].description = t.description;
			}
		}

		return order.map((t) => groups[t]);
	}

	function schemaTypeLabel(schema: Schema | undefined): string {
		if (!schema) return '';
		if (schema.$ref) return schema.$ref.split('/').pop() ?? schema.$ref;
		if (schema.type === 'array' && schema.items) {
			const itemRef = (schema.items as Record<string, unknown>).$ref as string | undefined;
			if (itemRef) return `${itemRef.split('/').pop()}[]`;
			return `${(schema.items as Record<string, unknown>).type ?? 'any'}[]`;
		}
		if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
		return schema.type ?? '';
	}

	function responseColor(code: string): string {
		const n = parseInt(code);
		if (n >= 200 && n < 300) return 'status-2xx';
		if (n >= 300 && n < 400) return 'status-3xx';
		if (n >= 400 && n < 500) return 'status-4xx';
		if (n >= 500) return 'status-5xx';
		return '';
	}
</script>

<div class="openapi">
	{#if loading}
		<p class="loading">Loading...</p>
	{:else if loadError}
		<p class="error">{loadError}</p>
	{:else if spec}
		<!-- Info -->
		{#if spec.info}
			<div class="info-block">
				<h1 class="spec-title">{spec.info.title ?? 'API Reference'}</h1>
				{#if spec.info.version}
					<span class="version-badge">{spec.info.version}</span>
				{/if}
				{#if spec.info.description}
					<p class="spec-description">{spec.info.description}</p>
				{/if}
			</div>
		{/if}

		<!-- Servers -->
		{#if spec.servers?.length}
			<div class="servers">
				<h3 class="section-label">Servers</h3>
				<ul class="server-list">
					{#each spec.servers as server}
						<li><code class="server-url">{server.url}</code>{#if server.description} — {server.description}{/if}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Paths / Operations -->
		{#if spec.paths && Object.keys(spec.paths).length > 0}
			{@const groups = groupByTag(spec.paths)}
			{#each groups as group}
				<section class="tag-group">
					<h2 class="tag-heading">{group.tag}</h2>
					{#if group.description}<p class="tag-description">{group.description}</p>{/if}

					{#each group.operations as { path, method, operation }}
						{@const opId = anchorId(path, method, operation)}
						{@const key = opId}
						<div class="operation" id={opId}>
							<button class="op-header" onclick={() => toggle(key)} aria-expanded={!isCollapsed(key)}>
								<span class="method-badge method-{method}">{method.toUpperCase()}</span>
								<code class="op-path">{path}</code>
								{#if operation.summary}
									<span class="op-summary">{operation.summary}</span>
								{/if}
								<span class="toggle-icon">{isCollapsed(key) ? '▶' : '▼'}</span>
							</button>

							{#if !isCollapsed(key)}
								<div class="op-body">
									{#if operation.description}
										<p class="op-description">{operation.description}</p>
									{/if}

									<!-- Parameters -->
									{#if operation.parameters?.length}
										<h4 class="subsection-label">Parameters</h4>
										<table class="params-table">
											<thead>
												<tr><th>Name</th><th>In</th><th>Type</th><th>Required</th><th>Description</th></tr>
											</thead>
											<tbody>
												{#each operation.parameters as param}
													<tr>
														<td><code>{param.name}</code></td>
														<td><span class="param-in">{param.in}</span></td>
														<td><code class="type-label">{schemaTypeLabel(param.schema as Schema)}</code></td>
														<td>{param.required ? '✓' : ''}</td>
														<td>{param.description ?? ''}</td>
													</tr>
												{/each}
											</tbody>
										</table>
									{/if}

									<!-- Request body -->
									{#if operation.requestBody}
										<h4 class="subsection-label">Request Body{operation.requestBody.required ? ' (required)' : ''}</h4>
										{#if operation.requestBody.description}
											<p class="op-description">{operation.requestBody.description}</p>
										{/if}
										{#if operation.requestBody.content}
											{#each Object.entries(operation.requestBody.content) as [mediaType, media]}
												<p class="media-type-label"><code>{mediaType}</code></p>
												{#if media.schema}
													<pre class="schema-preview">{JSON.stringify(media.schema, null, 2)}</pre>
												{/if}
											{/each}
										{/if}
									{/if}

									<!-- Responses -->
									{#if operation.responses && Object.keys(operation.responses).length > 0}
										<h4 class="subsection-label">Responses</h4>
										<table class="params-table">
											<thead>
												<tr><th>Status</th><th>Description</th><th>Content Type</th></tr>
											</thead>
											<tbody>
												{#each Object.entries(operation.responses) as [code, response]}
													<tr>
														<td><span class="status-code {responseColor(code)}">{code}</span></td>
														<td>{response.description ?? ''}</td>
														<td>
															{#if response.content}
																{#each Object.keys(response.content) as ct}
																	<code class="type-label">{ct}</code>
																{/each}
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</section>
			{/each}
		{/if}

		<!-- Schemas -->
		{#if spec.components?.schemas && Object.keys(spec.components.schemas).length > 0}
			<section class="schemas-section">
				<h2 class="tag-heading">Schemas</h2>
				{#each Object.entries(spec.components.schemas) as [name, schema]}
					{@const sId = schemaAnchorId(name)}
					<div class="schema-item" id={sId}>
						<button class="op-header" onclick={() => toggle(sId)} aria-expanded={!isCollapsed(sId)}>
							<span class="schema-name">{name}</span>
							{#if schema.type}<span class="param-in">{schema.type}</span>{/if}
							<span class="toggle-icon">{isCollapsed(sId) ? '▶' : '▼'}</span>
						</button>

						{#if !isCollapsed(sId)}
							<div class="op-body">
								{#if schema.description}
									<p class="op-description">{schema.description}</p>
								{/if}
								{#if schema.enum}
									<p class="op-description">Enum: {schema.enum.map((v) => JSON.stringify(v)).join(', ')}</p>
								{/if}
								{#if schema.properties && Object.keys(schema.properties).length > 0}
									<table class="params-table">
										<thead>
											<tr><th>Property</th><th>Type</th><th>Required</th><th>Description</th></tr>
										</thead>
										<tbody>
											{#each Object.entries(schema.properties) as [propName, propSchema]}
												<tr>
													<td><code>{propName}</code></td>
													<td><code class="type-label">{schemaTypeLabel(propSchema as Schema)}</code></td>
													<td>{schema.required?.includes(propName) ? '✓' : ''}</td>
													<td>{(propSchema as Schema).description ?? ''}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								{/if}
								{#if schema.allOf || schema.oneOf || schema.anyOf}
									<pre class="schema-preview">{JSON.stringify(schema, null, 2)}</pre>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</section>
		{/if}
	{/if}
</div>

<style>
	.openapi {
		font-family: var(--font-sans);
	}

	.loading, .error {
		color: var(--color-text-secondary);
	}
	.error { color: #d1242f; }

	/* Info block */
	.info-block {
		margin-bottom: 32px;
	}
	.spec-title {
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 8px;
	}
	.version-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 12px;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		font-size: 12px;
		font-family: var(--font-mono);
		margin-bottom: 12px;
	}
	.spec-description {
		color: var(--color-text-secondary);
		margin: 8px 0 0;
		line-height: 1.6;
	}

	/* Servers */
	.servers {
		margin-bottom: 24px;
	}
	.section-label {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 0 0 8px;
	}
	.server-list {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 14px;
	}
	.server-list li {
		margin: 4px 0;
	}
	.server-url {
		font-family: var(--font-mono);
		font-size: 13px;
	}

	/* Tag groups */
	.tag-group {
		margin-bottom: 32px;
	}
	.tag-heading {
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 4px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--color-border);
	}
	.tag-description {
		color: var(--color-text-secondary);
		font-size: 14px;
		margin: 4px 0 12px;
	}

	/* Operations */
	.operation {
		border: 1px solid var(--color-border);
		border-radius: 6px;
		margin-bottom: 8px;
		overflow: hidden;
	}
	.op-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		background: var(--color-bg-secondary);
		border: none;
		cursor: pointer;
		text-align: left;
		font-size: 14px;
		color: var(--color-text);
	}
	.op-header:hover {
		background: var(--color-border);
	}
	.op-path {
		font-family: var(--font-mono);
		font-size: 13px;
		font-weight: 500;
	}
	.op-summary {
		color: var(--color-text-secondary);
		font-size: 13px;
		flex: 1;
	}
	.toggle-icon {
		margin-left: auto;
		color: var(--color-text-secondary);
		font-size: 10px;
		flex-shrink: 0;
	}
	.op-body {
		padding: 16px;
		border-top: 1px solid var(--color-border);
		background: var(--color-bg);
	}
	.op-description {
		font-size: 14px;
		color: var(--color-text-secondary);
		margin: 0 0 12px;
		line-height: 1.6;
	}

	/* Method badges */
	.method-badge {
		display: inline-block;
		padding: 2px 7px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 700;
		font-family: var(--font-mono);
		flex-shrink: 0;
		min-width: 56px;
		text-align: center;
	}
	.method-get    { background: #d1f0d1; color: #155c15; }
	.method-post   { background: #d0e8ff; color: #0550ae; }
	.method-put    { background: #fff0d0; color: #7a4500; }
	.method-patch  { background: #ede0ff; color: #5c2d9a; }
	.method-delete { background: #ffd0d0; color: #9a2323; }
	.method-head, .method-options, .method-trace {
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
	}

	/* Parameters / responses table */
	.subsection-label {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-secondary);
		margin: 16px 0 8px;
	}
	.params-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		margin-bottom: 12px;
	}
	.params-table th {
		text-align: left;
		padding: 6px 8px;
		border-bottom: 1px solid var(--color-border);
		font-weight: 500;
		color: var(--color-text-secondary);
		font-size: 12px;
	}
	.params-table td {
		padding: 6px 8px;
		border-bottom: 1px solid var(--color-border);
		vertical-align: top;
	}
	.params-table tr:last-child td {
		border-bottom: none;
	}

	.param-in {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 3px;
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		font-size: 11px;
		font-family: var(--font-mono);
	}
	.type-label {
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--color-text-secondary);
	}

	/* Status codes */
	.status-code {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 3px;
		font-family: var(--font-mono);
		font-size: 12px;
		font-weight: 600;
	}
	.status-2xx { background: #d1f0d1; color: #155c15; }
	.status-3xx { background: #d0e8ff; color: #0550ae; }
	.status-4xx { background: #fff0d0; color: #7a4500; }
	.status-5xx { background: #ffd0d0; color: #9a2323; }

	/* Media type label */
	.media-type-label {
		font-size: 12px;
		color: var(--color-text-secondary);
		margin: 8px 0 4px;
	}

	/* Schema preview */
	.schema-preview {
		background: var(--color-bg-secondary);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 12px;
		font-family: var(--font-mono);
		font-size: 12px;
		overflow-x: auto;
		white-space: pre;
		margin: 0 0 12px;
	}

	/* Schemas section */
	.schemas-section {
		margin-bottom: 32px;
	}
	.schema-item {
		border: 1px solid var(--color-border);
		border-radius: 6px;
		margin-bottom: 8px;
		overflow: hidden;
	}
	.schema-name {
		font-family: var(--font-mono);
		font-size: 14px;
		font-weight: 600;
	}
</style>
