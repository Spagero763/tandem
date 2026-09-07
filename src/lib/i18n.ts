/**
 * Translations keyed off the language the user chose in Nimiq Pay, not the
 * device locale. Someone running a German phone in English Nimiq Pay should
 * get English here, and `navigator.language` would get that wrong.
 */

export const LANGUAGES = ['en', 'de', 'es', 'fr', 'pt'] as const
export type Language = (typeof LANGUAGES)[number]

export interface Copy {
  arenaLadder: string
  arenaPot: string

  resultComplete: string
  resultOutAt: (seconds: string) => string
  resultRank: string
  resultBest: string
  resultVersus: string
  resultMotes: string
  resultCombo: string
  resultGrazes: string
  resultLeft: string
  resultMismatch: string
  resultSignIn: string
  resultSigningIn: string
  resultSignInBlurb: string
  resultShare: string
  resultShared: string
  resultCopied: string
  resultShareFailed: string
  resultAgain: string
  resultSaving: string
  resultFooter: (seconds: number) => string
  shareText: (score: string) => string

  ladderTitle: string
  ladderCloses: (time: string) => string
  ladderClosed: string
  ladderPlayer: string
  ladderPlayers: string
  ladderEmpty: string
  ladderEmptyBlurb: string
  ladderPlay: string
  ladderYou: string
  ladderRun: string
  ladderRuns: string
  ladderFinished: string
  ladderPatron: string
  ladderFooter: string
  ladderError: string

  potTitle: string
  potBlurb: string
  potBackers: (count: number) => string
  potVerify: string
  potPayingOut: string
  potBackTitle: string
  potBackBlurb: string
  potPatronTitle: string
  potPatronBlurb: string
  potPatronActive: (amount: string) => string
  potFounderTitle: string
  potFounderBlurb: (price: string) => string
  potFounderOwned: string
  potFounderBuy: (price: string) => string
  potOutsideApp: string
  potSignInFirst: string
  potWalletBusy: string
  potThanks: (amount: string) => string
  potStaked: (amount: string) => string
  potFounderDone: string

  receiptTitle: string
  receiptBlurb: string
  receiptAgrees: string
  receiptAgreesBlurb: string
  receiptDisagrees: string
  receiptDisagreesBlurb: string
  receiptField: string
  receiptStored: string
  receiptReplayed: string
  receiptScore: string
  receiptMotes: string
  receiptCombo: string
  receiptGrazes: string
  receiptIntegrity: string
  receiptTicks: string
  receiptChecksum: string
  receiptPlayer: string
  receiptHeat: string
  receiptSeed: string
  receiptRules: string
  receiptLength: string
  receiptSize: string
  receiptFinished: string
  receiptEnded: string
  receiptExplainer: string
  receiptMissing: string

  navArena: string
  navLadder: string
  navPot: string

  errCancelled: string
  errOutsideApp: string
  errTimeout: string
  errGeneric: string
}

const en: Copy = {
  arenaLadder: 'Ladder',
  arenaPot: 'Pot',

  resultComplete: 'Heat complete',
  resultOutAt: (seconds) => `Out at ${seconds}s`,
  resultRank: 'Rank',
  resultBest: 'New personal best for this heat',
  resultVersus: 'vs',
  resultMotes: 'Motes',
  resultCombo: 'Combo',
  resultGrazes: 'Grazes',
  resultLeft: 'Left',
  resultMismatch:
    'The server replayed this run and got a different score than your device reported. The replayed score is the one that counts.',
  resultSignIn: 'Sign in to keep this score',
  resultSigningIn: 'Check your wallet…',
  resultSignInBlurb: 'One signature. No account, no email, nothing to remember.',
  resultShare: 'Challenge a friend',
  resultShared: 'Shared',
  resultCopied: 'Link copied',
  resultShareFailed: 'Could not share',
  resultAgain: 'Run it again',
  resultSaving: 'Saving…',
  resultFooter: (seconds) => `${seconds}s heat · everyone plays the same course today`,
  shareText: (score) => `I scored ${score} on today's Tandem heat. Beat my ghost.`,

  ladderTitle: 'Today’s heat',
  ladderCloses: (time) => `closes in ${time}`,
  ladderClosed: 'closed',
  ladderPlayer: 'player',
  ladderPlayers: 'players',
  ladderEmpty: 'Nobody has posted a score yet today.',
  ladderEmptyBlurb:
    'The course resets every day at midnight UTC. Be the first name on it.',
  ladderPlay: 'Play the heat',
  ladderYou: 'you',
  ladderRun: 'run',
  ladderRuns: 'runs',
  ladderFinished: 'finished',
  ladderPatron: 'Patron',
  ladderFooter:
    'Every score here was recomputed by the server from the run’s recorded inputs. A device cannot report a score it did not play.',
  ladderError: 'Could not load the ladder.',

  potTitle: 'Today’s pot',
  potBlurb: 'Playing is free. Backers fund the prize and cannot win it.',
  potBackers: (count) => (count === 1 ? '1 backer' : `${count} backers`),
  potVerify: 'verify on chain',
  potPayingOut: 'Paying out to',
  potBackTitle: 'Back the pot',
  potBackBlurb:
    'Sends NIM with an on-chain memo. It funds the prize for today’s best players and buys you nothing in the game.',
  potPatronTitle: 'Become a Patron',
  potPatronBlurb:
    'Stake NIM to a validator through Tandem. The stake stays yours and keeps earning; the mark next to your name is the only thing it changes here.',
  potPatronActive: (amount) => `You are a Patron, staking ${amount} NIM.`,
  potFounderTitle: 'Founder pack',
  potFounderBlurb: (price) =>
    `A one-off ${price} USDT on Polygon for a permanent mark. Cosmetic, like everything else here.`,
  potFounderOwned: 'You already have the Founder mark.',
  potFounderBuy: (price) => `Pay ${price} USDT on Polygon`,
  potOutsideApp:
    'Open Tandem inside Nimiq Pay to back the pot, stake, or buy the Founder pack. The ladder and the arena work anywhere.',
  potSignInFirst: 'Sign in from the arena first.',
  potWalletBusy: 'Check your wallet…',
  potThanks: (amount) => `Thanks. ${amount} NIM added to today’s pot.`,
  potStaked: (amount) => `Staked ${amount} NIM. Your stake stays yours.`,
  potFounderDone: 'Founder mark unlocked.',

  receiptTitle: 'Run receipt',
  receiptBlurb:
    'Every number below was recomputed just now by replaying this run’s recorded inputs.',
  receiptAgrees: 'Replay matches the ladder',
  receiptAgreesBlurb:
    'The stored score is exactly what these inputs produce on this course.',
  receiptDisagrees: 'Replay disagrees with the ladder',
  receiptDisagreesBlurb: 'This run is flagged. The replayed score is the one that counts.',
  receiptField: 'Field',
  receiptStored: 'Stored',
  receiptReplayed: 'Replayed',
  receiptScore: 'Score',
  receiptMotes: 'Motes',
  receiptCombo: 'Best combo',
  receiptGrazes: 'Grazes',
  receiptIntegrity: 'Integrity left',
  receiptTicks: 'Ticks',
  receiptChecksum: 'Checksum',
  receiptPlayer: 'Player',
  receiptHeat: 'Heat',
  receiptSeed: 'Course seed',
  receiptRules: 'Rules version',
  receiptLength: 'Run length',
  receiptSize: 'Replay size',
  receiptFinished: 'a finished heat',
  receiptEnded: 'an ended run',
  receiptExplainer:
    'The course is generated from the seed above, so it is identical for everyone who played this heat. The replay is the exact sequence of thumb positions, one per tick. Together they determine the score completely, which is why the device that played the run never gets to report it.',
  receiptMissing: 'This run could not be loaded.',

  navArena: 'Arena',
  navLadder: 'Ladder',
  navPot: 'Pot',

  errCancelled: 'You cancelled that in your wallet.',
  errOutsideApp: 'Open this in Nimiq Pay to connect your wallet.',
  errTimeout: 'Nimiq Pay took too long to respond. Try again.',
  errGeneric: 'Something went wrong. Try again.',
}

const de: Copy = {
  ...en,
  arenaLadder: 'Rangliste',
  arenaPot: 'Topf',

  resultComplete: 'Lauf beendet',
  resultOutAt: (seconds) => `Aus bei ${seconds}s`,
  resultRank: 'Platz',
  resultBest: 'Neue Bestleistung für diesen Lauf',
  resultVersus: 'gegen',
  resultMotes: 'Punkte',
  resultCombo: 'Combo',
  resultGrazes: 'Streifer',
  resultLeft: 'Übrig',
  resultMismatch:
    'Der Server hat diesen Lauf nachgerechnet und kam auf eine andere Punktzahl als dein Gerät. Es zählt die nachgerechnete Punktzahl.',
  resultSignIn: 'Anmelden und Punktzahl behalten',
  resultSigningIn: 'Sieh in deiner Wallet nach…',
  resultSignInBlurb: 'Eine Signatur. Kein Konto, keine E-Mail, nichts zu merken.',
  resultShare: 'Freund herausfordern',
  resultShared: 'Geteilt',
  resultCopied: 'Link kopiert',
  resultShareFailed: 'Teilen nicht möglich',
  resultAgain: 'Nochmal laufen',
  resultSaving: 'Wird gespeichert…',
  resultFooter: (seconds) => `${seconds}s Lauf · heute spielen alle dieselbe Strecke`,
  shareText: (score) =>
    `Ich habe heute ${score} im Tandem-Lauf erreicht. Schlag meinen Geist.`,

  ladderTitle: 'Heutiger Lauf',
  ladderCloses: (time) => `endet in ${time}`,
  ladderClosed: 'beendet',
  ladderPlayer: 'Spieler',
  ladderPlayers: 'Spieler',
  ladderEmpty: 'Heute hat noch niemand eine Punktzahl eingetragen.',
  ladderEmptyBlurb:
    'Die Strecke wird täglich um Mitternacht UTC neu erzeugt. Sei der erste Name darauf.',
  ladderPlay: 'Lauf spielen',
  ladderYou: 'du',
  ladderRun: 'Lauf',
  ladderRuns: 'Läufe',
  ladderFinished: 'durchgelaufen',
  ladderFooter:
    'Jede Punktzahl hier wurde vom Server aus den aufgezeichneten Eingaben neu berechnet. Ein Gerät kann keine Punktzahl melden, die es nicht gespielt hat.',
  ladderError: 'Rangliste konnte nicht geladen werden.',

  potTitle: 'Heutiger Topf',
  potBlurb: 'Spielen ist kostenlos. Unterstützer finanzieren den Preis und können ihn nicht gewinnen.',
  potBackers: (count) => (count === 1 ? '1 Unterstützer' : `${count} Unterstützer`),
  potVerify: 'on-chain prüfen',
  potPayingOut: 'Auszahlung an',
  potBackTitle: 'Topf unterstützen',
  potBackBlurb:
    'Sendet NIM mit einer Notiz on-chain. Es finanziert den Preis für die besten Spieler von heute und bringt dir im Spiel nichts.',
  potPatronTitle: 'Patron werden',
  potPatronBlurb:
    'Stake NIM über Tandem bei einem Validator. Der Einsatz bleibt deiner und verdient weiter; hier ändert er nur das Zeichen neben deinem Namen.',
  potPatronActive: (amount) => `Du bist Patron und stakest ${amount} NIM.`,
  potFounderTitle: 'Gründer-Paket',
  potFounderBlurb: (price) =>
    `Einmalig ${price} USDT auf Polygon für ein dauerhaftes Zeichen. Rein kosmetisch, wie alles hier.`,
  potFounderOwned: 'Du hast das Gründer-Zeichen bereits.',
  potFounderBuy: (price) => `${price} USDT auf Polygon zahlen`,
  potOutsideApp:
    'Öffne Tandem in Nimiq Pay, um den Topf zu unterstützen, zu staken oder das Gründer-Paket zu kaufen. Rangliste und Arena funktionieren überall.',
  potSignInFirst: 'Melde dich zuerst in der Arena an.',
  potWalletBusy: 'Sieh in deiner Wallet nach…',
  potThanks: (amount) => `Danke. ${amount} NIM zum heutigen Topf hinzugefügt.`,
  potStaked: (amount) => `${amount} NIM gestakt. Dein Einsatz bleibt deiner.`,
  potFounderDone: 'Gründer-Zeichen freigeschaltet.',

  receiptTitle: 'Lauf-Beleg',
  receiptBlurb:
    'Jede Zahl unten wurde soeben durch erneutes Abspielen der aufgezeichneten Eingaben berechnet.',
  receiptAgrees: 'Nachrechnung stimmt mit der Rangliste überein',
  receiptAgreesBlurb:
    'Die gespeicherte Punktzahl ist genau das, was diese Eingaben auf dieser Strecke ergeben.',
  receiptDisagrees: 'Nachrechnung weicht von der Rangliste ab',
  receiptDisagreesBlurb:
    'Dieser Lauf ist markiert. Es zählt die nachgerechnete Punktzahl.',
  receiptField: 'Feld',
  receiptStored: 'Gespeichert',
  receiptReplayed: 'Nachgerechnet',
  receiptScore: 'Punktzahl',
  receiptMotes: 'Punkte',
  receiptCombo: 'Beste Combo',
  receiptGrazes: 'Streifer',
  receiptIntegrity: 'Hüllen übrig',
  receiptTicks: 'Ticks',
  receiptChecksum: 'Prüfsumme',
  receiptPlayer: 'Spieler',
  receiptHeat: 'Lauf',
  receiptSeed: 'Streckensaat',
  receiptRules: 'Regelversion',
  receiptLength: 'Lauflänge',
  receiptSize: 'Aufzeichnungsgröße',
  receiptFinished: 'einem beendeten Lauf',
  receiptEnded: 'einem abgebrochenen Lauf',
  receiptExplainer:
    'Die Strecke wird aus der obigen Saat erzeugt und ist damit für alle identisch, die diesen Lauf gespielt haben. Die Aufzeichnung ist die exakte Folge der Daumenpositionen, eine pro Tick. Zusammen bestimmen sie die Punktzahl vollständig, weshalb das Gerät, das den Lauf gespielt hat, sie nie selbst melden darf.',
  receiptMissing: 'Dieser Lauf konnte nicht geladen werden.',

  navArena: 'Arena',
  navLadder: 'Rangliste',
  navPot: 'Topf',

  errCancelled: 'Du hast das in deiner Wallet abgebrochen.',
  errOutsideApp: 'Öffne dies in Nimiq Pay, um deine Wallet zu verbinden.',
  errTimeout: 'Nimiq Pay hat zu lange gebraucht. Versuch es nochmal.',
  errGeneric: 'Etwas ist schiefgelaufen. Versuch es nochmal.',
}

const es: Copy = {
  ...en,
  arenaLadder: 'Clasificación',
  arenaPot: 'Bote',

  resultComplete: 'Ronda completada',
  resultOutAt: (seconds) => `Fuera a los ${seconds}s`,
  resultRank: 'Puesto',
  resultBest: 'Nuevo récord personal en esta ronda',
  resultVersus: 'contra',
  resultMotes: 'Motas',
  resultCombo: 'Combo',
  resultGrazes: 'Roces',
  resultLeft: 'Restante',
  resultMismatch:
    'El servidor repitió esta partida y obtuvo una puntuación distinta a la que informó tu dispositivo. Cuenta la puntuación repetida.',
  resultSignIn: 'Inicia sesión para guardar esta puntuación',
  resultSigningIn: 'Revisa tu monedero…',
  resultSignInBlurb: 'Una firma. Sin cuenta, sin correo, nada que recordar.',
  resultShare: 'Reta a un amigo',
  resultShared: 'Compartido',
  resultCopied: 'Enlace copiado',
  resultShareFailed: 'No se pudo compartir',
  resultAgain: 'Jugar otra vez',
  resultSaving: 'Guardando…',
  resultFooter: (seconds) => `Ronda de ${seconds}s · hoy todos juegan el mismo recorrido`,
  shareText: (score) =>
    `Hice ${score} en la ronda de Tandem de hoy. Supera mi fantasma.`,

  ladderTitle: 'Ronda de hoy',
  ladderCloses: (time) => `cierra en ${time}`,
  ladderClosed: 'cerrada',
  ladderPlayer: 'jugador',
  ladderPlayers: 'jugadores',
  ladderEmpty: 'Nadie ha publicado una puntuación hoy.',
  ladderEmptyBlurb:
    'El recorrido se renueva cada día a medianoche UTC. Sé el primer nombre.',
  ladderPlay: 'Jugar la ronda',
  ladderYou: 'tú',
  ladderRun: 'partida',
  ladderRuns: 'partidas',
  ladderFinished: 'terminada',
  ladderFooter:
    'Cada puntuación aquí fue recalculada por el servidor a partir de las entradas grabadas. Un dispositivo no puede informar una puntuación que no jugó.',
  ladderError: 'No se pudo cargar la clasificación.',

  potTitle: 'Bote de hoy',
  potBlurb: 'Jugar es gratis. Quien aporta financia el premio y no puede ganarlo.',
  potBackers: (count) => (count === 1 ? '1 aportante' : `${count} aportantes`),
  potVerify: 'verificar en cadena',
  potPayingOut: 'Se reparte entre',
  potBackTitle: 'Aportar al bote',
  potBackBlurb:
    'Envía NIM con una nota en cadena. Financia el premio para los mejores de hoy y no te da nada dentro del juego.',
  potPatronTitle: 'Hazte Patrón',
  potPatronBlurb:
    'Haz staking de NIM con un validador a través de Tandem. Lo depositado sigue siendo tuyo y sigue generando; aquí solo cambia la marca junto a tu nombre.',
  potPatronActive: (amount) => `Eres Patrón, con ${amount} NIM en staking.`,
  potFounderTitle: 'Pack Fundador',
  potFounderBlurb: (price) =>
    `Un pago único de ${price} USDT en Polygon por una marca permanente. Cosmético, como todo aquí.`,
  potFounderOwned: 'Ya tienes la marca de Fundador.',
  potFounderBuy: (price) => `Pagar ${price} USDT en Polygon`,
  potOutsideApp:
    'Abre Tandem dentro de Nimiq Pay para aportar al bote, hacer staking o comprar el pack Fundador. La clasificación y la arena funcionan en cualquier sitio.',
  potSignInFirst: 'Inicia sesión primero desde la arena.',
  potWalletBusy: 'Revisa tu monedero…',
  potThanks: (amount) => `Gracias. ${amount} NIM añadidos al bote de hoy.`,
  potStaked: (amount) => `${amount} NIM en staking. Lo depositado sigue siendo tuyo.`,
  potFounderDone: 'Marca de Fundador desbloqueada.',

  receiptTitle: 'Recibo de la partida',
  receiptBlurb:
    'Cada número de abajo se acaba de recalcular repitiendo las entradas grabadas de esta partida.',
  receiptAgrees: 'La repetición coincide con la clasificación',
  receiptAgreesBlurb:
    'La puntuación guardada es exactamente lo que producen estas entradas en este recorrido.',
  receiptDisagrees: 'La repetición no coincide con la clasificación',
  receiptDisagreesBlurb:
    'Esta partida está marcada. Cuenta la puntuación repetida.',
  receiptField: 'Campo',
  receiptStored: 'Guardado',
  receiptReplayed: 'Repetido',
  receiptScore: 'Puntuación',
  receiptMotes: 'Motas',
  receiptCombo: 'Mejor combo',
  receiptGrazes: 'Roces',
  receiptIntegrity: 'Integridad restante',
  receiptTicks: 'Ticks',
  receiptChecksum: 'Suma de control',
  receiptPlayer: 'Jugador',
  receiptHeat: 'Ronda',
  receiptSeed: 'Semilla del recorrido',
  receiptRules: 'Versión de reglas',
  receiptLength: 'Duración',
  receiptSize: 'Tamaño de la repetición',
  receiptFinished: 'una ronda terminada',
  receiptEnded: 'una partida interrumpida',
  receiptExplainer:
    'El recorrido se genera a partir de la semilla de arriba, así que es idéntico para todos los que jugaron esta ronda. La repetición es la secuencia exacta de posiciones del pulgar, una por tick. Juntas determinan la puntuación por completo, y por eso el dispositivo que jugó la partida nunca llega a informarla.',
  receiptMissing: 'No se pudo cargar esta partida.',

  navArena: 'Arena',
  navLadder: 'Clasificación',
  navPot: 'Bote',

  errCancelled: 'Cancelaste eso en tu monedero.',
  errOutsideApp: 'Abre esto en Nimiq Pay para conectar tu monedero.',
  errTimeout: 'Nimiq Pay tardó demasiado en responder. Inténtalo de nuevo.',
  errGeneric: 'Algo salió mal. Inténtalo de nuevo.',
}

const fr: Copy = {
  ...en,
  arenaLadder: 'Classement',
  arenaPot: 'Cagnotte',

  resultComplete: 'Manche terminée',
  resultOutAt: (seconds) => `Éliminé à ${seconds}s`,
  resultRank: 'Rang',
  resultBest: 'Nouveau record personnel sur cette manche',
  resultVersus: 'contre',
  resultMotes: 'Éclats',
  resultCombo: 'Combo',
  resultGrazes: 'Frôlements',
  resultLeft: 'Restant',
  resultMismatch:
    'Le serveur a rejoué cette partie et a obtenu un score différent de celui annoncé par votre appareil. C’est le score rejoué qui compte.',
  resultSignIn: 'Connectez-vous pour garder ce score',
  resultSigningIn: 'Vérifiez votre portefeuille…',
  resultSignInBlurb: 'Une signature. Pas de compte, pas d’e-mail, rien à retenir.',
  resultShare: 'Défier un ami',
  resultShared: 'Partagé',
  resultCopied: 'Lien copié',
  resultShareFailed: 'Partage impossible',
  resultAgain: 'Rejouer',
  resultSaving: 'Enregistrement…',
  resultFooter: (seconds) => `Manche de ${seconds}s · tout le monde joue le même parcours aujourd’hui`,
  shareText: (score) =>
    `J’ai fait ${score} sur la manche Tandem du jour. Bats mon fantôme.`,

  ladderTitle: 'Manche du jour',
  ladderCloses: (time) => `se termine dans ${time}`,
  ladderClosed: 'terminée',
  ladderPlayer: 'joueur',
  ladderPlayers: 'joueurs',
  ladderEmpty: 'Personne n’a encore publié de score aujourd’hui.',
  ladderEmptyBlurb:
    'Le parcours est régénéré chaque jour à minuit UTC. Soyez le premier nom dessus.',
  ladderPlay: 'Jouer la manche',
  ladderYou: 'vous',
  ladderRun: 'partie',
  ladderRuns: 'parties',
  ladderFinished: 'terminée',
  ladderFooter:
    'Chaque score ici a été recalculé par le serveur à partir des entrées enregistrées. Un appareil ne peut pas annoncer un score qu’il n’a pas joué.',
  ladderError: 'Impossible de charger le classement.',

  potTitle: 'Cagnotte du jour',
  potBlurb: 'Jouer est gratuit. Les contributeurs financent le prix et ne peuvent pas le gagner.',
  potBackers: (count) => (count === 1 ? '1 contributeur' : `${count} contributeurs`),
  potVerify: 'vérifier on-chain',
  potPayingOut: 'Réparti entre',
  potBackTitle: 'Soutenir la cagnotte',
  potBackBlurb:
    'Envoie des NIM avec une note on-chain. Cela finance le prix des meilleurs joueurs du jour et ne vous apporte rien dans le jeu.',
  potPatronTitle: 'Devenir Mécène',
  potPatronBlurb:
    'Stakez des NIM auprès d’un validateur via Tandem. La mise reste la vôtre et continue de rapporter ; ici, elle ne change que la marque à côté de votre nom.',
  potPatronActive: (amount) => `Vous êtes Mécène, avec ${amount} NIM en staking.`,
  potFounderTitle: 'Pack Fondateur',
  potFounderBlurb: (price) =>
    `${price} USDT sur Polygon, une seule fois, pour une marque permanente. Cosmétique, comme tout le reste ici.`,
  potFounderOwned: 'Vous avez déjà la marque Fondateur.',
  potFounderBuy: (price) => `Payer ${price} USDT sur Polygon`,
  potOutsideApp:
    'Ouvrez Tandem dans Nimiq Pay pour soutenir la cagnotte, staker ou acheter le pack Fondateur. Le classement et l’arène fonctionnent partout.',
  potSignInFirst: 'Connectez-vous d’abord depuis l’arène.',
  potWalletBusy: 'Vérifiez votre portefeuille…',
  potThanks: (amount) => `Merci. ${amount} NIM ajoutés à la cagnotte du jour.`,
  potStaked: (amount) => `${amount} NIM stakés. Votre mise reste la vôtre.`,
  potFounderDone: 'Marque Fondateur débloquée.',

  receiptTitle: 'Reçu de la partie',
  receiptBlurb:
    'Chaque chiffre ci-dessous vient d’être recalculé en rejouant les entrées enregistrées de cette partie.',
  receiptAgrees: 'La relecture correspond au classement',
  receiptAgreesBlurb:
    'Le score enregistré est exactement ce que ces entrées produisent sur ce parcours.',
  receiptDisagrees: 'La relecture diffère du classement',
  receiptDisagreesBlurb:
    'Cette partie est signalée. C’est le score rejoué qui compte.',
  receiptField: 'Champ',
  receiptStored: 'Enregistré',
  receiptReplayed: 'Rejoué',
  receiptScore: 'Score',
  receiptMotes: 'Éclats',
  receiptCombo: 'Meilleur combo',
  receiptGrazes: 'Frôlements',
  receiptIntegrity: 'Intégrité restante',
  receiptTicks: 'Ticks',
  receiptChecksum: 'Somme de contrôle',
  receiptPlayer: 'Joueur',
  receiptHeat: 'Manche',
  receiptSeed: 'Graine du parcours',
  receiptRules: 'Version des règles',
  receiptLength: 'Durée',
  receiptSize: 'Taille de la relecture',
  receiptFinished: 'une manche terminée',
  receiptEnded: 'une partie interrompue',
  receiptExplainer:
    'Le parcours est généré à partir de la graine ci-dessus : il est donc identique pour tous ceux qui ont joué cette manche. La relecture est la séquence exacte des positions du pouce, une par tick. Ensemble, elles déterminent entièrement le score, et c’est pourquoi l’appareil qui a joué la partie ne l’annonce jamais lui-même.',
  receiptMissing: 'Impossible de charger cette partie.',

  navArena: 'Arène',
  navLadder: 'Classement',
  navPot: 'Cagnotte',

  errCancelled: 'Vous avez annulé cela dans votre portefeuille.',
  errOutsideApp: 'Ouvrez ceci dans Nimiq Pay pour connecter votre portefeuille.',
  errTimeout: 'Nimiq Pay a mis trop de temps à répondre. Réessayez.',
  errGeneric: 'Une erreur est survenue. Réessayez.',
}

const pt: Copy = {
  ...en,
  arenaLadder: 'Classificação',
  arenaPot: 'Prêmio',

  resultComplete: 'Rodada concluída',
  resultOutAt: (seconds) => `Fora aos ${seconds}s`,
  resultRank: 'Posição',
  resultBest: 'Novo recorde pessoal nesta rodada',
  resultVersus: 'contra',
  resultMotes: 'Fragmentos',
  resultCombo: 'Combo',
  resultGrazes: 'Roçadas',
  resultLeft: 'Restante',
  resultMismatch:
    'O servidor repetiu esta partida e obteve uma pontuação diferente da informada pelo seu aparelho. Vale a pontuação repetida.',
  resultSignIn: 'Entre para guardar esta pontuação',
  resultSigningIn: 'Confira sua carteira…',
  resultSignInBlurb: 'Uma assinatura. Sem conta, sem e-mail, nada para lembrar.',
  resultShare: 'Desafie um amigo',
  resultShared: 'Compartilhado',
  resultCopied: 'Link copiado',
  resultShareFailed: 'Não foi possível compartilhar',
  resultAgain: 'Jogar de novo',
  resultSaving: 'Salvando…',
  resultFooter: (seconds) => `Rodada de ${seconds}s · hoje todos jogam o mesmo percurso`,
  shareText: (score) =>
    `Fiz ${score} na rodada de Tandem de hoje. Supere o meu fantasma.`,

  ladderTitle: 'Rodada de hoje',
  ladderCloses: (time) => `encerra em ${time}`,
  ladderClosed: 'encerrada',
  ladderPlayer: 'jogador',
  ladderPlayers: 'jogadores',
  ladderEmpty: 'Ninguém publicou pontuação hoje.',
  ladderEmptyBlurb:
    'O percurso é renovado todo dia à meia-noite UTC. Seja o primeiro nome nele.',
  ladderPlay: 'Jogar a rodada',
  ladderYou: 'você',
  ladderRun: 'partida',
  ladderRuns: 'partidas',
  ladderFinished: 'concluída',
  ladderFooter:
    'Cada pontuação aqui foi recalculada pelo servidor a partir das entradas gravadas. Um aparelho não pode informar uma pontuação que não jogou.',
  ladderError: 'Não foi possível carregar a classificação.',

  potTitle: 'Prêmio de hoje',
  potBlurb: 'Jogar é grátis. Quem apoia financia o prêmio e não pode ganhá-lo.',
  potBackers: (count) => (count === 1 ? '1 apoiador' : `${count} apoiadores`),
  potVerify: 'verificar na rede',
  potPayingOut: 'Dividido entre',
  potBackTitle: 'Apoiar o prêmio',
  potBackBlurb:
    'Envia NIM com uma nota na rede. Financia o prêmio para os melhores de hoje e não te dá nada dentro do jogo.',
  potPatronTitle: 'Seja um Patrono',
  potPatronBlurb:
    'Faça staking de NIM em um validador pelo Tandem. O valor continua seu e seguindo rendendo; aqui ele só muda a marca ao lado do seu nome.',
  potPatronActive: (amount) => `Você é Patrono, com ${amount} NIM em staking.`,
  potFounderTitle: 'Pacote Fundador',
  potFounderBlurb: (price) =>
    `Pagamento único de ${price} USDT na Polygon por uma marca permanente. Cosmético, como tudo aqui.`,
  potFounderOwned: 'Você já tem a marca de Fundador.',
  potFounderBuy: (price) => `Pagar ${price} USDT na Polygon`,
  potOutsideApp:
    'Abra o Tandem dentro do Nimiq Pay para apoiar o prêmio, fazer staking ou comprar o pacote Fundador. A classificação e a arena funcionam em qualquer lugar.',
  potSignInFirst: 'Entre primeiro pela arena.',
  potWalletBusy: 'Confira sua carteira…',
  potThanks: (amount) => `Obrigado. ${amount} NIM adicionados ao prêmio de hoje.`,
  potStaked: (amount) => `${amount} NIM em staking. O valor continua seu.`,
  potFounderDone: 'Marca de Fundador liberada.',

  receiptTitle: 'Recibo da partida',
  receiptBlurb:
    'Cada número abaixo acabou de ser recalculado repetindo as entradas gravadas desta partida.',
  receiptAgrees: 'A repetição confere com a classificação',
  receiptAgreesBlurb:
    'A pontuação guardada é exatamente o que essas entradas produzem neste percurso.',
  receiptDisagrees: 'A repetição diverge da classificação',
  receiptDisagreesBlurb:
    'Esta partida está sinalizada. Vale a pontuação repetida.',
  receiptField: 'Campo',
  receiptStored: 'Guardado',
  receiptReplayed: 'Repetido',
  receiptScore: 'Pontuação',
  receiptMotes: 'Fragmentos',
  receiptCombo: 'Melhor combo',
  receiptGrazes: 'Roçadas',
  receiptIntegrity: 'Integridade restante',
  receiptTicks: 'Ticks',
  receiptChecksum: 'Soma de verificação',
  receiptPlayer: 'Jogador',
  receiptHeat: 'Rodada',
  receiptSeed: 'Semente do percurso',
  receiptRules: 'Versão das regras',
  receiptLength: 'Duração',
  receiptSize: 'Tamanho da repetição',
  receiptFinished: 'uma rodada concluída',
  receiptEnded: 'uma partida interrompida',
  receiptExplainer:
    'O percurso é gerado a partir da semente acima, então é idêntico para todos que jogaram esta rodada. A repetição é a sequência exata das posições do polegar, uma por tick. Juntas elas determinam a pontuação por completo, e é por isso que o aparelho que jogou a partida nunca chega a informá-la.',
  receiptMissing: 'Não foi possível carregar esta partida.',

  navArena: 'Arena',
  navLadder: 'Classificação',
  navPot: 'Prêmio',

  errCancelled: 'Você cancelou isso na sua carteira.',
  errOutsideApp: 'Abra isto no Nimiq Pay para conectar sua carteira.',
  errTimeout: 'O Nimiq Pay demorou demais para responder. Tente de novo.',
  errGeneric: 'Algo deu errado. Tente de novo.',
}

const DICTIONARIES: Record<Language, Copy> = { en, de, es, fr, pt }

export function isSupported(code: string | undefined): code is Language {
  return typeof code === 'string' && (LANGUAGES as readonly string[]).includes(code)
}

export function copyFor(code: string | undefined): Copy {
  return isSupported(code) ? DICTIONARIES[code] : en
}
