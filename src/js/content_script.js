// Smart Links Content Script

let mappings = [];
let enabled = false;

// Load settings
chrome.storage.sync.get({ mappings: [], smartLinksEnabled: false }, (res) => {
    mappings = res.mappings || [];
    enabled = res.smartLinksEnabled;
    if (enabled) {
        initSmartLinks();
    }
});

// Listen for changes
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.mappings) mappings = changes.mappings.newValue || [];
        if (changes.smartLinksEnabled) {
            enabled = changes.smartLinksEnabled.newValue;
            if (enabled) {
                initSmartLinks();
            } else {
                // Optional: Remove links (complex, maybe just reload page requirement)
                location.reload();
            }
        }
    }
});

function initSmartLinks() {
    if (!mappings.length) return;

    // Build regex from prefixes
    // Prefix must be followed by hyphen and numbers
    const prefixes = mappings.map(m => m.prefix).filter(Boolean).join('|');
    if (!prefixes) return;

    const regex = new RegExp(`\\b(${prefixes})-\\d+\\b`, 'gi');

    // Walk the DOM
    walk(document.body, regex);

    // Observe changes
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    walk(node, regex);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    processTextNode(node, regex);
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

function walk(root, regex) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    const nodes = [];
    while (walker.nextNode()) {
        nodes.push(walker.currentNode);
    }

    for (const node of nodes) {
        processTextNode(node, regex);
    }
}

function processTextNode(node, regex) {
    // Skip if parent is already a link or script/style/textarea/input
    const parent = node.parentNode;
    if (!parent) return;
    const tag = parent.tagName.toLowerCase();
    if (['a', 'script', 'style', 'textarea', 'input', 'code', 'pre'].includes(tag)) return;
    if (parent.isContentEditable) return;

    const text = node.nodeValue;
    if (!text) return;

    // Find matches
    let match;
    let lastIndex = 0;
    const fragments = [];
    let hasMatch = false;

    // Reset regex state
    regex.lastIndex = 0;

    // We need to use exec in a loop to find all matches
    // Note: regex must have global flag 'g'
    while ((match = regex.exec(text)) !== null) {
        hasMatch = true;
        const key = match[0];
        const idx = match.index;

        // Text before match
        if (idx > lastIndex) {
            fragments.push(document.createTextNode(text.slice(lastIndex, idx)));
        }

        // Link
        const link = document.createElement('a');
        link.textContent = key;
        link.href = getUrl(key);
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.style.color = '#0052cc'; // Jira blue
        link.style.textDecoration = 'none';
        link.dataset.jiraSmartLink = 'true';

        // Add hover effect via inline style or class (using inline for simplicity in content script)
        link.onmouseover = () => link.style.textDecoration = 'underline';
        link.onmouseout = () => link.style.textDecoration = 'none';

        fragments.push(link);

        lastIndex = regex.lastIndex;
    }

    if (hasMatch) {
        // Remaining text
        if (lastIndex < text.length) {
            fragments.push(document.createTextNode(text.slice(lastIndex)));
        }

        // Replace node
        const fragment = document.createDocumentFragment();
        fragments.forEach(f => fragment.appendChild(f));
        parent.replaceChild(fragment, node);
    }
}

function getUrl(key) {
    const upperKey = key.toUpperCase();
    const prefix = upperKey.split('-')[0];
    const mapping = mappings.find(m => m.prefix.toUpperCase() === prefix);
    if (!mapping) return '#';

    let base = mapping.baseUrl;
    if (!base.endsWith('/')) base += '/';
    return base + upperKey;
}
