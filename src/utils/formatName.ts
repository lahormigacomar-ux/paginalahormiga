/**
 * Utility to format employee/person names in Proper Title Case (e.g. "Carlos Ramos" instead of "RAMOS CARLOS" or "RAMOS CARLOS")
 */
export function formatPersonName(name?: string): string {
  if (!name || !name.trim()) return '';
  const clean = name.trim();

  // Known name corrections (including inverted names)
  const upper = clean.toUpperCase();
  if (upper === 'RAMOS CARLOS' || upper === 'CARLOS RAMOS') return 'Carlos Ramos';
  if (upper === 'VILLA HUMBERTO' || upper === 'HUMBERTO VILLA') return 'Humberto Villa';
  if (upper === 'BARROS BASILIO' || upper === 'BASILIO BARROS') return 'Basilio Barros';
  if (upper === 'BETO BOLIVAR' || upper === 'BETO BOLÍVAR') return 'Beto Bolívar';
  if (upper === 'CARAYURI NEFTALI' || upper === 'NEFTALI CARAYURI') return 'Neftalí Carayuri';
  if (upper === 'DANIEL GARCIA' || upper === 'DANIEL GARCÍA') return 'Daniel García';
  if (upper === 'ANDRES ACOSTA' || upper === 'ANDRÉS ACOSTA') return 'Andrés Acosta';
  if (upper === 'ENRIQUE SORUCO') return 'Enrique Soruco';
  if (upper === 'DARIO RAMOS' || upper === 'DARÍO RAMOS') return 'Darío Ramos';
  if (upper === 'JAVIER GUILLERMO COMAN') return 'Javier Guillermo Coman';
  if (upper === 'SEBASTIAN MEALLA') return 'Sebastian Mealla';

  // Words to keep lowercase in compound names
  const lowerWords = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'von', 'van']);

  // Title Case conversion for general names
  const words = clean.split(/\s+/);
  return words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && lowerWords.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}
