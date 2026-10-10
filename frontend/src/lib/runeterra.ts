/*
 * Legends of Runeterra champion cards, by League champion name: [set, card code, region, focus x, focus y].
 * The focus is where the champion sits in the art (fractions of its width and height): every card is a 2048x1024
 * landscape image, and the frames that show it (tall card, phone banner, ultra-wide hero) each crop a different part.
 * Found by a saliency scan of each card, checked by eye, with a few hand-set centres (Gnar, Vi, Malphite).
 * Riot publishes the full art on its own CDN (Data Dragon for LoR); we link to it and never copy it.
 * Generated from the set data at https://dd.b.pvp.net/latest/set<N>/en_us/data/set<N>-en_us.json (sets 1-8, collectible champions).
 */
const CARDS: Record<string, [number, string, string, number, number]> = {
  "Ahri": [5, "05IO004", "Ionia", 0.53, 0.38],
  "Akshan": [4, "04SH130", "Shurima", 0.27, 0.38],
  "Anivia": [1, "01FR024", "Freljord", 0.44, 0.41],
  "Annie": [6, "06NX012", "Noxus", 0.59, 0.45],
  "Aphelios": [3, "03MT217", "Targon", 0.51, 0.48],
  "Ashe": [1, "01FR038", "Freljord", 0.38, 0.44],
  "Aurelion Sol": [3, "03MT087", "Targon", 0.62, 0.40],
  "Azir": [4, "04SH003", "Shurima", 0.43, 0.43],
  "Bard": [6, "06RU001", "Runeterra", 0.44, 0.45],
  "Braum": [1, "01FR009", "Freljord", 0.55, 0.39],
  "Caitlyn": [5, "05PZ006", "PiltoverZaun", 0.36, 0.46],
  "Darius": [1, "01NX038", "Noxus", 0.45, 0.48],
  "Diana": [3, "03MT056", "Targon", 0.47, 0.41],
  "Draven": [1, "01NX020", "Noxus", 0.64, 0.49],
  "Ekko": [4, "04PZ001", "PiltoverZaun", 0.59, 0.41],
  "Elise": [1, "01SI053", "ShadowIsles", 0.35, 0.47],
  "Evelynn": [6, "06RU025", "Runeterra", 0.60, 0.39],
  "Ezreal": [1, "01PZ036", "PiltoverZaun", 0.38, 0.49],
  "Fiora": [1, "01DE045", "Demacia", 0.57, 0.46],
  "Fizz": [2, "02BW046", "BandleCity", 0.52, 0.39],
  "Galio": [5, "05DE009", "Demacia", 0.56, 0.45],
  "Gangplank": [2, "02BW032", "Bilgewater", 0.60, 0.35],
  "Garen": [1, "01DE012", "Demacia", 0.53, 0.41],
  "Gnar": [5, "05BC161", "BandleCity", 0.73, 0.33],
  "Gwen": [6, "06SI012", "ShadowIsles", 0.65, 0.34],
  "Hecarim": [1, "01SI042", "ShadowIsles", 0.61, 0.46],
  "Heimerdinger": [1, "01PZ056", "BandleCity", 0.61, 0.44],
  "Illaoi": [6, "06BW006", "Bilgewater", 0.43, 0.51],
  "Irelia": [4, "04IO005", "Ionia", 0.51, 0.44],
  "Janna": [8, "08PZ001", "PiltoverZaun", 0.56, 0.43],
  "Jarvan IV": [4, "04DE008", "Demacia", 0.71, 0.44],
  "Jayce": [5, "05PZ022", "PiltoverZaun", 0.49, 0.35],
  "Jhin": [6, "06RU002", "Runeterra", 0.58, 0.35],
  "Jinx": [1, "01PZ040", "PiltoverZaun", 0.48, 0.59],
  "Kai'Sa": [6, "06SH009", "Shurima", 0.39, 0.51],
  "Kalista": [1, "01SI030", "ShadowIsles", 0.58, 0.47],
  "Karma": [1, "01IO041", "Ionia", 0.53, 0.43],
  "Katarina": [1, "01NX042", "Noxus", 0.51, 0.36],
  "Kennen": [5, "05BC058", "BandleCity", 0.59, 0.47],
  "Kindred": [4, "04SI005", "ShadowIsles", 0.64, 0.42],
  "LeBlanc": [4, "04NX004", "Noxus", 0.44, 0.54],
  "Lee Sin": [2, "02IO006", "Ionia", 0.55, 0.53],
  "Leona": [3, "03MT054", "Targon", 0.52, 0.34],
  "Lissandra": [4, "04FR005", "Freljord", 0.61, 0.45],
  "Lucian": [1, "01DE022", "Demacia", 0.59, 0.51],
  "Lulu": [3, "03IO002", "BandleCity", 0.58, 0.42],
  "Lux": [1, "01DE042", "Demacia", 0.39, 0.49],
  "Malphite": [4, "04MT008", "Targon", 0.56, 0.41],
  "Maokai": [2, "02SI008", "ShadowIsles", 0.51, 0.41],
  "Miss Fortune": [2, "02BW022", "Bilgewater", 0.61, 0.34],
  "Mordekaiser": [8, "08SI042", "ShadowIsles", 0.64, 0.36],
  "Morgana": [8, "08MT003", "Targon", 0.60, 0.34],
  "Nami": [5, "05BW005", "Bilgewater", 0.65, 0.41],
  "Nasus": [4, "04SH047", "Shurima", 0.62, 0.57],
  "Nautilus": [2, "02BW053", "Bilgewater", 0.61, 0.36],
  "Nilah": [8, "08BW008", "Bilgewater", 0.53, 0.45],
  "Nocturne": [3, "03SI005", "ShadowIsles", 0.48, 0.38],
  "Pantheon": [5, "05MT003", "Targon", 0.34, 0.46],
  "Poppy": [5, "05BC041", "BandleCity", 0.61, 0.30],
  "Pyke": [4, "04BW005", "Bilgewater", 0.55, 0.38],
  "Quinn": [2, "02DE006", "Demacia", 0.43, 0.44],
  "Rek'Sai": [4, "04SH019", "Shurima", 0.48, 0.48],
  "Renekton": [4, "04SH067", "Shurima", 0.49, 0.35],
  "Riven": [3, "03NX007", "Noxus", 0.60, 0.32],
  "Rumble": [5, "05BC088", "BandleCity", 0.34, 0.43],
  "Samira": [7, "07NX007", "Noxus", 0.49, 0.47],
  "Sejuani": [2, "02FR002", "Freljord", 0.55, 0.37],
  "Senna": [5, "05SI009", "ShadowIsles", 0.47, 0.47],
  "Sett": [7, "07IO011", "Ionia", 0.44, 0.55],
  "Shen": [1, "01IO032", "Ionia", 0.41, 0.46],
  "Shyvana": [3, "03DE011", "Demacia", 0.54, 0.48],
  "Sion": [5, "05NX001", "Noxus", 0.62, 0.39],
  "Sivir": [4, "04SH020", "Shurima", 0.46, 0.43],
  "Soraka": [3, "03MT055", "Targon", 0.53, 0.45],
  "Swain": [2, "02NX007", "Noxus", 0.59, 0.48],
  "Tahm Kench": [3, "03BW004", "Bilgewater", 0.53, 0.53],
  "Taliyah": [4, "04SH073", "Shurima", 0.29, 0.47],
  "Taric": [3, "03MT058", "Targon", 0.37, 0.52],
  "Teemo": [1, "01PZ008", "BandleCity", 0.42, 0.53],
  "Thresh": [1, "01SI052", "ShadowIsles", 0.45, 0.39],
  "Tristana": [5, "05BC133", "BandleCity", 0.56, 0.40],
  "Trundle": [3, "03FR006", "Freljord", 0.53, 0.39],
  "Tryndamere": [1, "01FR039", "Freljord", 0.54, 0.48],
  "Twisted Fate": [2, "02BW026", "Bilgewater", 0.47, 0.52],
  "Udyr": [5, "05FR013", "Freljord", 0.46, 0.47],
  "Veigar": [5, "05BC093", "BandleCity", 0.61, 0.46],
  "Vi": [2, "02PZ008", "PiltoverZaun", 0.47, 0.46],
  "Viego": [4, "04SI055", "ShadowIsles", 0.66, 0.43],
  "Viktor": [3, "03PZ003", "PiltoverZaun", 0.56, 0.46],
  "Vladimir": [1, "01NX006", "Noxus", 0.54, 0.37],
  "Volibear": [8, "08FR001", "Freljord", 0.45, 0.42],
  "Xerath": [5, "05SH014", "Shurima", 0.56, 0.42],
  "Yasuo": [1, "01IO015", "Ionia", 0.57, 0.36],
  "Yuumi": [5, "05BC029", "BandleCity", 0.53, 0.47],
  "Zed": [1, "01IO009", "Ionia", 0.46, 0.39],
  "Ziggs": [5, "05BC163", "BandleCity", 0.64, 0.48],
  "Zilean": [4, "04SH039", "Shurima", 0.64, 0.46],
  "Zoe": [3, "03MT009", "Targon", 0.44, 0.51],
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

/** Where the champion sits in an image, as fractions of its width and height. */
export type Focus = [number, number]
/** Every Runeterra card image is 2048x1024. */
export const CARD_RATIO = 2
/** League splash art (the wide one, not the loading-screen portrait) is 1215x717. */
export const SPLASH_RATIO = 1215 / 717
export const SPLASH_FOCUS: Focus = [0.58, 0.4]
export const splashUrl = (key: string): string => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_0.jpg`

/** A soft cut-out of the champion in the card art (see public/masks), used as the near layer of the depth effect. */
export const maskUrl = (champion: string): string => `${import.meta.env.BASE_URL}masks/${champion.replace(/[ ']/g, '')}.png`

/**
 * The `object-position` that keeps the focus in view when an image of `imageRatio` (width / height) is cropped
 * to fill a frame of `frameRatio` with object-fit: cover. A wide image in a tall frame loses its sides, so the
 * horizontal focus matters; a frame wider than the image loses top and bottom, so the vertical focus does.
 */
export function coverPosition(focus: Focus, imageRatio: number, frameRatio: number): string {
  const place = (f: number, visible: number) => (visible >= 1 ? 0.5 : Math.min(1, Math.max(0, (f - visible / 2) / (1 - visible))))
  if (frameRatio < imageRatio) return `${(place(focus[0], frameRatio / imageRatio) * 100).toFixed(1)}% 50%`
  return `50% ${(place(focus[1], imageRatio / frameRatio) * 100).toFixed(1)}%`
}

export interface RuneterraCard {
  url: string
  mask: string
  focus: Focus
  /** The region's key (for example PiltoverZaun); regionName is the one to show. */
  region: string
  regionName: string
  color: string
}

/** The champion's Runeterra card art, or null when it has none (most of the newer champions). */
export function cardFor(champion: string): RuneterraCard | null {
  const c = CARDS[champion]
  if (!c) return null
  const [set, code, region, fx, fy] = c
  return {
    url: `${ART}/set${set}/en_us/img/cards/${code}-full.png`,
    mask: maskUrl(champion),
    focus: [fx, fy],
    region,
    regionName: REGION_NAME[region] ?? region,
    color: REGION_COLOR[region] ?? '#cfcfd8',
  }
}
