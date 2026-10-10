/*
 * Legends of Runeterra champion cards, by League champion name: [set, card code, region].
 * Riot publishes the full art on its own CDN (Data Dragon for LoR); we link to it and never copy it.
 * Generated from the set data at https://dd.b.pvp.net/latest/set<N>/en_us/data/set<N>-en_us.json (sets 1-8, collectible champions).
 */
const CARDS: Record<string, [number, string, string]> = {
  "Ahri": [5, "05IO004", "Ionia"],
  "Akshan": [4, "04SH130", "Shurima"],
  "Anivia": [1, "01FR024", "Freljord"],
  "Annie": [6, "06NX012", "Noxus"],
  "Aphelios": [3, "03MT217", "Targon"],
  "Ashe": [1, "01FR038", "Freljord"],
  "Aurelion Sol": [3, "03MT087", "Targon"],
  "Azir": [4, "04SH003", "Shurima"],
  "Bard": [6, "06RU001", "Runeterra"],
  "Braum": [1, "01FR009", "Freljord"],
  "Caitlyn": [5, "05PZ006", "PiltoverZaun"],
  "Darius": [1, "01NX038", "Noxus"],
  "Diana": [3, "03MT056", "Targon"],
  "Draven": [1, "01NX020", "Noxus"],
  "Ekko": [4, "04PZ001", "PiltoverZaun"],
  "Elder Dragon": [8, "08RU014", "Runeterra"],
  "Elise": [1, "01SI053", "ShadowIsles"],
  "Evelynn": [6, "06RU025", "Runeterra"],
  "Ezreal": [1, "01PZ036", "PiltoverZaun"],
  "Fiora": [1, "01DE045", "Demacia"],
  "Fizz": [2, "02BW046", "BandleCity"],
  "Galio": [5, "05DE009", "Demacia"],
  "Gangplank": [2, "02BW032", "Bilgewater"],
  "Garen": [1, "01DE012", "Demacia"],
  "Gnar": [5, "05BC161", "BandleCity"],
  "Gwen": [6, "06SI012", "ShadowIsles"],
  "Hecarim": [1, "01SI042", "ShadowIsles"],
  "Heimerdinger": [1, "01PZ056", "BandleCity"],
  "Illaoi": [6, "06BW006", "Bilgewater"],
  "Irelia": [4, "04IO005", "Ionia"],
  "Jack": [7, "07BW002", "Bilgewater"],
  "Janna": [8, "08PZ001", "PiltoverZaun"],
  "Jarvan IV": [4, "04DE008", "Demacia"],
  "Jayce": [5, "05PZ022", "PiltoverZaun"],
  "Jhin": [6, "06RU002", "Runeterra"],
  "Jinx": [1, "01PZ040", "PiltoverZaun"],
  "Kai'Sa": [6, "06SH009", "Shurima"],
  "Kalista": [1, "01SI030", "ShadowIsles"],
  "Karma": [1, "01IO041", "Ionia"],
  "Katarina": [1, "01NX042", "Noxus"],
  "Kennen": [5, "05BC058", "BandleCity"],
  "Kindred": [4, "04SI005", "ShadowIsles"],
  "LeBlanc": [4, "04NX004", "Noxus"],
  "Lee Sin": [2, "02IO006", "Ionia"],
  "Leona": [3, "03MT054", "Targon"],
  "Lissandra": [4, "04FR005", "Freljord"],
  "Lucian": [1, "01DE022", "Demacia"],
  "Lulu": [3, "03IO002", "BandleCity"],
  "Lux": [1, "01DE042", "Demacia"],
  "Malphite": [4, "04MT008", "Targon"],
  "Maokai": [2, "02SI008", "ShadowIsles"],
  "Miss Fortune": [2, "02BW022", "Bilgewater"],
  "Mordekaiser": [8, "08SI042", "ShadowIsles"],
  "Morgana": [8, "08MT003", "Targon"],
  "Nami": [5, "05BW005", "Bilgewater"],
  "Nasus": [4, "04SH047", "Shurima"],
  "Nautilus": [2, "02BW053", "Bilgewater"],
  "Nilah": [8, "08BW008", "Bilgewater"],
  "Nocturne": [3, "03SI005", "ShadowIsles"],
  "Pantheon": [5, "05MT003", "Targon"],
  "Poppy": [5, "05BC041", "BandleCity"],
  "Pyke": [4, "04BW005", "Bilgewater"],
  "Quinn": [2, "02DE006", "Demacia"],
  "Rek'Sai": [4, "04SH019", "Shurima"],
  "Renekton": [4, "04SH067", "Shurima"],
  "Riven": [3, "03NX007", "Noxus"],
  "Rumble": [5, "05BC088", "BandleCity"],
  "Samira": [7, "07NX007", "Noxus"],
  "Sejuani": [2, "02FR002", "Freljord"],
  "Senna": [5, "05SI009", "ShadowIsles"],
  "Sett": [7, "07IO011", "Ionia"],
  "Shen": [1, "01IO032", "Ionia"],
  "Shyvana": [3, "03DE011", "Demacia"],
  "Sion": [5, "05NX001", "Noxus"],
  "Sivir": [4, "04SH020", "Shurima"],
  "Soraka": [3, "03MT055", "Targon"],
  "Swain": [2, "02NX007", "Noxus"],
  "Tahm Kench": [3, "03BW004", "Bilgewater"],
  "Taliyah": [4, "04SH073", "Shurima"],
  "Taric": [3, "03MT058", "Targon"],
  "Teemo": [1, "01PZ008", "BandleCity"],
  "Thresh": [1, "01SI052", "ShadowIsles"],
  "Tristana": [5, "05BC133", "BandleCity"],
  "Trundle": [3, "03FR006", "Freljord"],
  "Tryndamere": [1, "01FR039", "Freljord"],
  "Twisted Fate": [2, "02BW026", "Bilgewater"],
  "Udyr": [5, "05FR013", "Freljord"],
  "Veigar": [5, "05BC093", "BandleCity"],
  "Vi": [2, "02PZ008", "PiltoverZaun"],
  "Viego": [4, "04SI055", "ShadowIsles"],
  "Viktor": [3, "03PZ003", "PiltoverZaun"],
  "Vladimir": [1, "01NX006", "Noxus"],
  "Volibear": [8, "08FR001", "Freljord"],
  "Xerath": [5, "05SH014", "Shurima"],
  "Yasuo": [1, "01IO015", "Ionia"],
  "Yuumi": [5, "05BC029", "BandleCity"],
  "Zed": [1, "01IO009", "Ionia"],
  "Ziggs": [5, "05BC163", "BandleCity"],
  "Zilean": [4, "04SH039", "Shurima"],
  "Zoe": [3, "03MT009", "Targon"],
}

const ART = 'https://dd.b.pvp.net/latest'

/** Region colours: the slideshow tints its accent, the embers and the progress bar with the card's region. */
const REGION_COLOR: Record<string, string> = {
  Demacia: '#e3c068',
  Noxus: '#e0524a',
  Ionia: '#f07aa8',
  Freljord: '#74cdee',
  PiltoverZaun: '#e8a93c',
  ShadowIsles: '#4fd6b8',
  Bilgewater: '#ea6a3c',
  Targon: '#9a86ff',
  Shurima: '#eccb52',
  BandleCity: '#86dc62',
  Runeterra: '#cfcfd8',
}
const REGION_NAME: Record<string, string> = { PiltoverZaun: 'Piltover & Zaun', ShadowIsles: 'Shadow Isles', BandleCity: 'Bandle City' }

export interface RuneterraCard {
  url: string
  region: string
  regionName: string
  color: string
}

/** The champion's Runeterra card art, or null when it has none (most of the newer champions). */
export function cardFor(champion: string): RuneterraCard | null {
  const c = CARDS[champion]
  if (!c) return null
  const [set, code, region] = c
  return {
    url: `${ART}/set${set}/en_us/img/cards/${code}-full.png`,
    region,
    regionName: REGION_NAME[region] ?? region,
    color: REGION_COLOR[region] ?? '#cfcfd8',
  }
}
