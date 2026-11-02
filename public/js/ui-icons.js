const paths = {
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
  presentation: '<rect x="3" y="3" width="18" height="13" rx="1"/><path d="M12 16v5m-4 0h8m-7-14 6 3-6 3Z"/>',
  playlist: '<path d="M4 5h16M4 10h16M4 15h9M4 20h9m4-6 5 3-5 3Z"/>',
  lyrics: '<path d="M12 4v12m0-10 8-2v10"/><ellipse cx="8" cy="17" rx="4" ry="3"/><ellipse cx="17" cy="15" rx="3" ry="2"/>',
  media: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 8 6 4-6 4Z"/>',
  bible: '<path d="M5 3h15v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 14h15M12 6v8M9 9h6"/>',
  chat: '<path d="M4 3h16v14H9l-5 4Z"/><path d="M8 7h8M8 11h6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 11h6M9 15h6"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="m3 3 18 18M10 5a12 12 0 0 1 12 7s-1 3-4 5M6 6a19 19 0 0 0-4 6s3 7 10 7a12 12 0 0 0 5-1M10 10a3 3 0 0 0 4 4"/>'
};

export function uiIcon(name) {
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] ?? ''}</svg>`;
}
