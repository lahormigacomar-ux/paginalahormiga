/**
 * Convierte un importe numérico a su representación en palabras en español (formato legal AFIP / ARCA).
 * Ejemplo: 1210.00 -> "SON PESOS UN MIL DOSCIENTOS DIEZ CON 00/100 M.N."
 */
export function numeroALetras(monto: number, moneda: 'ARS' | 'USD' | string = 'ARS'): string {
  const upperMoneda = String(moneda || 'ARS').toUpperCase();
  const isUsd =
    upperMoneda === 'USD' ||
    upperMoneda === 'DOL' ||
    upperMoneda.includes('USD') ||
    upperMoneda.includes('DOLAR') ||
    upperMoneda.includes('DÓLAR');
  if (isNaN(monto) || monto <= 0) {
    return isUsd
      ? 'SON DÓLARES ESTADOUNIDENSES CERO CON 00/100 USD'
      : 'SON PESOS CERO CON 00/100 M.N.';
  }

  const enteros = Math.floor(monto);
  const centavos = Math.round((monto - enteros) * 100);
  const centavosText = String(centavos).padStart(2, '0');

  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const diezA19 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  function convertirGrupo(n: number): string {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    let str = '';
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (c > 0) str += centenas[c] + ' ';

    if (d === 1) {
      str += diezA19[u];
    } else if (d === 2) {
      if (u === 0) str += 'VEINTE';
      else str += 'VEINTI' + unidades[u].toLowerCase();
    } else {
      if (d > 2) str += decenas[d] + (u > 0 ? ' Y ' : '');
      if (u > 0 && d !== 1) str += unidades[u];
    }
    return str.trim().toUpperCase();
  }

  function convertir(num: number): string {
    if (num === 0) return 'CERO';
    let res = '';

    const millones = Math.floor(num / 1000000);
    const miles = Math.floor((num % 1000000) / 1000);
    const resto = num % 1000;

    if (millones > 0) {
      if (millones === 1) res += 'UN MILLON ';
      else res += convertirGrupo(millones) + ' MILLONES ';
    }

    if (miles > 0) {
      if (miles === 1) res += 'UN MIL ';
      else res += convertirGrupo(miles) + ' MIL ';
    }

    if (resto > 0) {
      res += convertirGrupo(resto);
    }

    return res.trim();
  }

  const textoEntero = convertir(enteros);
  return isUsd
    ? `SON DÓLARES ESTADOUNIDENSES ${textoEntero} CON ${centavosText}/100 USD`
    : `SON PESOS ${textoEntero} CON ${centavosText}/100 M.N.`;
}
