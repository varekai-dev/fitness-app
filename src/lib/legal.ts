import * as WebBrowser from 'expo-web-browser';

import { lang } from '@/lib/i18n';

/** The landing page (`landing/`, deployed to Vercel), in the app's language. */
const LANDING_URL = `https://fitness-landing-tau.vercel.app/${lang === 'en' ? 'en/' : ''}`;

export const openPrivacyPolicy = () => WebBrowser.openBrowserAsync(`${LANDING_URL}privacy/`);
