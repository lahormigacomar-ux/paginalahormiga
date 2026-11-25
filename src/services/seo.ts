import { SiteSettings } from '../types';

/**
 * Updates Schema.org JSON-LD structured data and meta tags
 * dynamically based on the current SiteSettings (loaded from cloud/local storage).
 */
export function updateSeoStructuredData(settings: SiteSettings): void {
  if (typeof document === 'undefined') return;

  const companyName = settings.companyName || 'LA HORMIGA';
  const slogan = settings.slogan || 'Pequeños grandes movimientos';
  const description = settings.heroSubtitle || 'Alquiler de maquinaria vial pesada con operario, herramientas menores, eventos y gastronomía, ferretería, movimientos de suelo y áridos en Jujuy.';
  const address = settings.direccion || 'San Salvador de Jujuy, Jujuy, Argentina';
  const phone = settings.telefonoPrincipal || settings.whatsapp || '+54 388 456-7890';
  const email = settings.email || 'contacto@lahormiga.com.ar';
  const banner = settings.heroBannerUrl || 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&h=630&q=80';
  const logo = settings.customLogoUrl || settings.customLogoUrlDark || banner;

  // Extract locality and region
  let locality = 'San Salvador de Jujuy';
  let region = 'Jujuy';
  let latitude = -24.1858;
  let longitude = -65.2995;

  if (address.toLowerCase().includes('palpalá') || address.toLowerCase().includes('palpala')) {
    locality = 'Palpalá';
    latitude = -24.2564;
    longitude = -65.2128;
  } else if (address.toLowerCase().includes('perico')) {
    locality = 'Perico';
    latitude = -24.3831;
    longitude = -65.1147;
  } else if (address.toLowerCase().includes('san pedro')) {
    locality = 'San Pedro de Jujuy';
    latitude = -24.2325;
    longitude = -64.8661;
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'HomeAndConstructionBusiness',
    name: companyName,
    legalName: `${companyName} Alquileres & Servicios`,
    slogan: slogan,
    description: description,
    image: banner,
    logo: logo,
    telephone: phone,
    email: email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: address,
      addressLocality: locality,
      addressRegion: region,
      addressCountry: 'AR',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: latitude,
      longitude: longitude,
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '07:00',
        closes: '18:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: 'Saturday',
        opens: '07:30',
        closes: '13:00',
      },
    ],
    priceRange: '$$',
    currenciesAccepted: 'ARS, USD',
    paymentAccepted: 'Cash, Credit Card, Bank Transfer',
    areaServed: {
      '@type': 'AdministrativeArea',
      name: `${region}, Argentina`,
    },
  };

  // Find or create schema script
  let scriptEl = document.getElementById('schema-structured-data') as HTMLScriptElement | null;
  if (!scriptEl) {
    scriptEl = document.createElement('script');
    scriptEl.id = 'schema-structured-data';
    scriptEl.type = 'application/ld+json';
    document.head.appendChild(scriptEl);
  }
  scriptEl.textContent = JSON.stringify(structuredData, null, 2);

  // Sync meta description and social tags
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', description);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', description);

  const twDesc = document.querySelector('meta[name="twitter:description"]');
  if (twDesc) twDesc.setAttribute('content', description);

  const ogSiteName = document.querySelector('meta[property="og:site_name"]');
  if (ogSiteName) ogSiteName.setAttribute('content', companyName);
}
