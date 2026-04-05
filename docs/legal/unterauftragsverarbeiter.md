# Liste der Unterauftragsverarbeiter
## Sub-Processor List

gemäß Art. 28 Abs. 2 DSGVO / in accordance with Art. 28(2) GDPR

---

## Aktuell eingesetzte Unterauftragsverarbeiter

| Unterauftragsverarbeiter | Zweck | Standort | Rechtsgrundlage | DPA Status |
|--------------------------|-------|----------|-----------------|------------|
| **Anthropic, PBC** | KI-Sprachverarbeitung (Claude API) | USA | SCCs + DPF | [Link zu DPA] |
| **Twilio Inc.** | Telefonie, SMS, Spracherkennung | USA | SCCs + DPF | [Link zu DPA] |
| **ElevenLabs, Inc.** | Text-to-Speech (Sprachsynthese) | USA/EU | SCCs | [Link zu DPA] |
| **Resend, Inc.** | E-Mail-Versand | USA | SCCs + DPF | [Link zu DPA] |
| **Google LLC** | Kalenderintegration (Google Calendar API) | USA/EU | SCCs + DPF | [Link zu DPA] |
| **Sentry (Functional Software, Inc.)** | Fehlerüberwachung | USA | SCCs + DPF | [Link zu DPA] |

---

## Details zu den Unterauftragsverarbeitern

### 1. Anthropic, PBC (Claude AI)

**Zweck der Verarbeitung:**
- Analyse und Klassifizierung von Anruferanliegen
- Generierung natürlichsprachlicher Antworten
- Extraktion von Termininformationen aus Gesprächen

**Verarbeitete Daten:**
- Transkribierte Gesprächsinhalte
- Kontextinformationen zum Gespräch

**Datenspeicherung:**
- Prompts werden nicht für Training verwendet (Zero Data Retention Policy)
- Keine dauerhafte Speicherung von Kundendaten

**Standort:** San Francisco, USA

**Rechtsgrundlage für Drittlandübermittlung:**
- EU-Standardvertragsklauseln (SCCs)
- EU-US Data Privacy Framework (DPF) Zertifizierung

**Kontakt:** privacy@anthropic.com

---

### 2. Twilio Inc.

**Zweck der Verarbeitung:**
- Annahme eingehender Anrufe
- Spracherkennung (Speech-to-Text)
- Text-to-Speech (Polly)
- Anrufweiterleitung

**Verarbeitete Daten:**
- Telefonnummern der Anrufer
- Audiodaten während des Anrufs
- Anruf-Metadaten (Dauer, Zeitpunkt)

**Datenspeicherung:**
- Anrufprotokolle gemäß Twilio-Richtlinien
- Keine Speicherung von Audioinhalten (sofern nicht konfiguriert)

**Standort:** San Francisco, USA

**Rechtsgrundlage für Drittlandübermittlung:**
- EU-Standardvertragsklauseln (SCCs)
- EU-US Data Privacy Framework (DPF) Zertifizierung
- Binding Corporate Rules (BCRs)

**DPA:** https://www.twilio.com/legal/data-protection-addendum

**Kontakt:** privacy@twilio.com

---

### 3. ElevenLabs, Inc.

**Zweck der Verarbeitung:**
- Umwandlung von Text in natürliche Sprache
- Generierung von Sprachausgaben für Anrufe

**Verarbeitete Daten:**
- Zu sprechende Textinhalte
- Voice-ID des gewählten Sprechers

**Datenspeicherung:**
- Keine dauerhafte Speicherung von generierten Audiodateien
- Texte werden nicht für Modelltraining verwendet

**Standort:** USA (mit EU-Verarbeitung verfügbar)

**Rechtsgrundlage für Drittlandübermittlung:**
- EU-Standardvertragsklauseln (SCCs)

**DPA:** https://elevenlabs.io/dpa

**Kontakt:** privacy@elevenlabs.io

---

### 4. Resend, Inc.

**Zweck der Verarbeitung:**
- Versand von System-E-Mails
- Benachrichtigungen an Administratoren
- Einladungs-E-Mails für neue Benutzer

**Verarbeitete Daten:**
- E-Mail-Adressen der Empfänger
- E-Mail-Inhalte
- Zustellstatus

**Datenspeicherung:**
- E-Mail-Logs für 30 Tage
- Keine Speicherung von E-Mail-Inhalten nach Zustellung

**Standort:** USA

**Rechtsgrundlage für Drittlandübermittlung:**
- EU-Standardvertragsklauseln (SCCs)
- EU-US Data Privacy Framework (DPF) Zertifizierung

**DPA:** https://resend.com/legal/dpa

**Kontakt:** privacy@resend.com

---

### 5. Google LLC (Google Calendar API)

**Zweck der Verarbeitung:**
- Synchronisierung von Terminen mit Google Calendar
- Verfügbarkeitsprüfung
- Kalenderereignis-Verwaltung

**Verarbeitete Daten:**
- Termindetails (Zeit, Dauer, Beschreibung)
- Kundennamen und Kontaktdaten (im Termineintrag)
- OAuth-Tokens für Kalenderzugriff

**Datenspeicherung:**
- Gemäß Google Workspace Datenschutzrichtlinien
- Daten werden im Google-Konto des Auftraggebers gespeichert

**Standort:** USA/EU (je nach Google Workspace Einstellung)

**Rechtsgrundlage für Drittlandübermittlung:**
- EU-Standardvertragsklauseln (SCCs)
- EU-US Data Privacy Framework (DPF) Zertifizierung
- Angemessenheitsbeschluss für bestimmte Google-Dienste

**DPA:** https://cloud.google.com/terms/data-processing-addendum

**Kontakt:** googlecloud-compliance@google.com

---

### 6. Sentry (Functional Software, Inc.)

**Zweck der Verarbeitung:**
- Fehlerüberwachung und -protokollierung
- Performance-Monitoring
- Debugging-Unterstützung

**Verarbeitete Daten:**
- Fehlerberichte und Stack-Traces
- Technische Metadaten (Browser, OS, IP-Adresse)
- Benutzer-IDs (keine PII)

**Datenschutzmaßnahmen:**
- PII-Redaktion vor dem Senden aktiviert
- Keine Speicherung von Telefonnummern oder Namen
- IP-Adressen werden anonymisiert

**Standort:** USA

**Rechtsgrundlage für Drittlandübermittlung:**
- EU-Standardvertragsklauseln (SCCs)
- EU-US Data Privacy Framework (DPF) Zertifizierung

**DPA:** https://sentry.io/legal/dpa/

**Kontakt:** compliance@sentry.io

---

## Änderungshistorie

| Datum | Änderung | Version |
|-------|----------|---------|
| [DATUM] | Initiale Liste erstellt | 1.0 |

---

## Widerspruchsrecht

Gemäß Art. 28 Abs. 2 DSGVO werden Auftraggeber über Änderungen an der Liste der Unterauftragsverarbeiter informiert. Sie haben das Recht, gegen die Einbeziehung neuer Unterauftragsverarbeiter innerhalb von **14 Tagen** nach Mitteilung Einspruch zu erheben.

Bei berechtigtem Einspruch wird gemeinsam eine Lösung erarbeitet. Kann keine Einigung erzielt werden, steht dem Auftraggeber ein Sonderkündigungsrecht für den betroffenen Dienst zu.

---

## Kontakt für Datenschutzanfragen

Bei Fragen zu den Unterauftragsverarbeitern oder Datenschutz allgemein:

**E-Mail:** datenschutz@[ihredomain].de

---

*Dokumentversion: 1.0*
*Stand: [DATUM]*
