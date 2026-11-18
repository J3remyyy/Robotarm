# Achsenabgleich · 27. Oktober 2026

Geprüft wurden `Roboter Achsen.txt`, `robot-control.js`, die vorhandenen HTML-Dateien sowie die Montagezeichnungen `Guide.png` und `Control.png`. Die in der Textdatei genannten Firmware-Dateien `src/receiver/main.cpp` und `lib/RobotLink/src/RobotLink.cpp` liegen nicht im Ordner. Es wurde kein echter Roboter angesteuert.

## Übereinstimmende Werte

USB-Sollwerte liegen zwischen 0 und 4095. Die Umrechnung lautet:

`Winkel = (min + USB-Wert / 4095 × (max − min) − 2048) × 360 / 4096`.

| Achse | Funktion | Servo min / max | Winkelbereich relativ zur Servo-Mitte | Nullpose, USB-Wert |
| --- | --- | --- | --- | --- |
| 1 | Basis | 800 / 3450 | −109,69° bis +123,22° | 1929 |
| 2 | Schulter | 900 / 3200 | −100,90° bis +101,25° | 2044 |
| 3 | Ellbogen | 1000 / 3050 | −92,11° bis +88,07° | 2093 |
| 4 | Handgelenk-Neigung | 900 / 3200 | −100,90° bis +101,25° | 2044 |
| 5 | Werkzeug-Rotation | 180 / 3900 | −164,18° bis +162,77° | 2056 |
| 6 | Greifer-Servo | 1230 / 2600 | −71,89° bis +48,52° | 2445 |

Die drei Gliedlängen betragen 115 / 135 / 165 mm. L3 umfasst das Werkzeug bis zur Spitze.

Die Berechnung verwendet die dokumentierten Vorzeichen: Ein steigender Wert an Achse 2 kippt den Oberarm nach vorne; an Achse 3 klappt der Ellbogen ein; an Achse 4 neigt sich das Werkzeug nach unten. Der Innenwinkel des Ellbogens ist `90° − Servo-Winkel`, also etwa 182,11° bis 1,93°. Die zusätzliche vereinfachte Körperprüfung kann bereits vor dem Servo-Anschlag stoppen.

Die dokumentierte Nullpose ist `1929 2044 2093 2044 2056 2445`, nicht sechs Mal 2048. Der Firmware-Befehl `H` wird vom Nullpose-Button nicht verwendet.

In der Z-Konvention des Textdokuments wurden die Werkzeugpositionen folgender Referenzen geprüft (Rundungstoleranz 0,4 mm):

| Dokumentierte Pose | Erwartete Spitze X / Y / Z, mm |
| --- | --- |
| Nullpose | 300 / 0 / 115 |
| Senkrecht gestreckt | 0 / 0 / 415 |
| Waagerecht gestreckt | 415 / 0 / 0 |
| Nullpose, Werkzeug nach unten | 135 / 0 / −50 |
| Basis +90° bei Nullpose | 0 / 300 / 115 |
| Basis −90° bei Nullpose | 0 / −300 / 115 |

## Grenzen der Verifikation

- **Achse 1:** Das Textdokument und `robot-control.js` beschreiben eine Drehung um die senkrechte Z-Achse. Die Montagezeichnungen legen eine waagerechte Montageachse aus der Wand nahe. Die 3D-Seite behält deshalb den bisherigen Wandmodus X bei; im rechten Bedienfeld lässt sich Z auswählen. Der Nutzer hat bestätigt, dass der ursprünglich am Boden montierte Arm jetzt an der Wand hängt; damit bleibt X die passende Auswahl für die erste Motorachse. Die genaue Drehlage der Baugruppe an der Wand und die räumliche Nullpose nach dem Umbau sind aus den Dateien nicht vollständig bestimmbar.
- **Achse 5 und 6:** Der Drehsinn von Werkzeug-Rotation sowie Öffnen/Schließen des Greifers ist im Dokument ausdrücklich nicht geprüft. Die USB-Kalibrierungswerte stimmen; ihre reale Bewegungsrichtung ist damit noch nicht nachgewiesen. Die Darstellung der beweglichen Greiferbacke ist eine vereinfachte Mechanik, keine gemessene Servo-zu-Backen-Kalibrierung.
- **Geschwindigkeit:** Es liegen keine Motor-Geschwindigkeiten vor. Die Bewegungsbegrenzungen, insbesondere maximal 18°/s für Achse 4, sind gewählte Simulationswerte.
- **Positionsrückmeldung:** `POS` liefert laut Dokument Sollwerte. Beim Boardstart werden reale Servo-Positionen eingelesen; spätere POS-Antworten sind kein Nachweis, dass eine Bewegung bereits mechanisch abgeschlossen ist.
- **Kollisionen:** Die Körper-, Wand- und Bodenprüfungen sind vereinfachte Modellprüfungen. Reale Gegenstände und die echte Umgebung werden weder aus dem Kamerabild erkannt noch dadurch abgesichert.

## Kamera und virtuelle Gegenstände

„Kamera wählen“ öffnet die Auswahl der vom Browser angebotenen Videoquellen. Nach „Kamera freigeben“ werden die Kameranamen angezeigt; die gewünschte USB-Kamera wird über ihre Geräte-ID gewählt. Es wird ausschließlich Video angefordert (`audio: false`). Ein Wechsel auf „Simulation“, Ausschalten, Verlust der Kamera oder Verlassen der Seite beendet die aktive Aufnahme. Das Bild wird ohne Spiegelung und mit erhaltenem Seitenverhältnis angezeigt.

Die Videoquelle ist ein eigenes Browser-Mediengerät; der serielle USB-Anschluss überträgt weiterhin nur Roboterbefehle und Positionen. Das reale Bild erscheint in der Greifervorschau beziehungsweise der großen Greiferansicht. Die Seiten- und Draufsicht bleiben virtuelle Robotermodelle. Objektmarkierungen aus der Simulation werden nicht auf das reale Bild projiziert. Die reale Kameraausrichtung und Optik sind nicht vermessen.

„Blöcke: ein/aus“ blendet virtuelle Blöcke und Ablagen zusammen aus. Ausgeblendete Objekte lassen sich nicht unsichtbar greifen und ihre virtuelle Physik wird angehalten. Mit verbundenem Roboter werden virtuelle Objekte nicht als real gegriffen behandelt. Die bestehende USB-Sperre bis zur expliziten Positionsübernahme bleibt wirksam.

## Wiederholbarer Offline-Test

`node robot-control-3d.audit.cjs`

Der Test prüft ohne Gerätezugriff die sechs Kalibrierungsbereiche, Umrechnung an den Grenzen, Nullpose, sechs dokumentierte Beispielposen, Gliedlängen, Ellbogen-Innenwinkel, die USB-Freigabe erst nach expliziter Positionsübernahme sowie das Ausblenden virtueller Gegenstände. Die genaue räumliche Montageorientierung und reale Drehrichtungen lassen sich damit nicht nachweisen.

Die Kameraanbindung verwendet die Browser-APIs [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) und [enumerateDevices](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices). Der Browser benötigt dafür eine Kamerafreigabe; die Seite kann als lokale Datei, über localhost oder über HTTPS geöffnet werden.

## Zusätzliche Greiferprüfung

- `Guide.png` ordnet Achse 4 der Werkzeugneigung, Achse 5 der Rotation unmittelbar vor dem Greifer und Achse 6 dem Greifen zu. Diese Zuordnung entspricht der 3D-Seite.
- Die feste Backe bleibt bei einer Änderung von Achse 6 unverändert; ausschließlich die andere Backe schwenkt. Das entspricht der Beschreibung des Nutzers. Die Zeichnungen selbst sind schematisch und geben die Backenmechanik nicht im Detail an.
- Der Greifer liegt innerhalb von L3. Die feste Werkzeugspitze liegt 165 mm vom Handgelenk entfernt; es wird nicht noch einmal eine zusätzliche Greiferlänge auf die dokumentierten 165 mm aufgeschlagen.
- Die Kalibrierung von Achse 6 ist 1230–2600 in den internen Servo-Einheiten, entsprechend −71,89° bis +48,52° relativ zur Servo-Mitte. Über USB werden weiterhin normierte Werte 0–4095 geschickt. Der normierte Neutralwert 2445 entspricht ungefähr Servo 2048.
- **Darstellungsannahme:** `jawGeometry()` bildet den normierten Bereich auf 0–60° Backenschwenkung ab. Diese 60° sind eine Modellannahme; die Textdatei beschreibt 120,41° Servo-Weg und enthält weder Getriebeübersetzung noch Backenwinkel, Gelenkabstände oder eine geschlossene Referenzstellung. Der Servo-Weg lässt sich deshalb nicht direkt als sichtbarer Backenwinkel übernehmen.
- Die aktuelle Bedienlogik nimmt abnehmende normierte Werte als Schließen an. Das Textdokument bestätigt dieses Vorzeichen ausdrücklich nicht. Die Prüfung der Dateien bestätigt daher die elektrische Wertezuordnung, aber noch nicht die reale Öffnungsrichtung oder den physischen Öffnungswinkel.

Bei dieser zusätzlichen Prüfung wurde die Greifermechanik nicht verändert.
