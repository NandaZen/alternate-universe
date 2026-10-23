import { startStore, onStoreChange } from './data/store.js';
import { initState } from './state.js';
import { initNavigation, registerAction, applyRoute, renderNav } from './navigation.js';
import { initHome, renderHome } from './home.js';
import { initLanding, renderLanding } from './landing.js';
import { initNotes } from './apps/notes.js';
import { initWhatsApp } from './apps/whatsapp.js';
import { initGallery } from './apps/gallery.js';
import { initTwitter } from './apps/twitter.js';
import { initStories } from './apps/stories.js';

await startStore(); // tunggu semua koleksi terbaca dulu
initState();
initNavigation();
initHome();
initLanding();
initNotes(registerAction);
initWhatsApp(registerAction);
initGallery(registerAction);
initTwitter(registerAction);
initStories(registerAction);
applyRoute();

onStoreChange(() => {
  renderLanding();
  renderHome();
  renderNav();
});

document.getElementById('app-loading')?.remove(); // opsional: loader di HTML