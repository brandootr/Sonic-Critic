import JSZip from 'jszip';
import { SessionBlueprint, SessionTrack, PluginInsert } from '../types';

/**
 * Utility to escape XML strings.
 */
function escapeXml(unsafe: string): string {
  if (!unsafe) return "";
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Utility to generate Studio One style GUID strings.
 */
function generateGuid() {
  return '{' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16).toUpperCase();
  }) + '}';
}

/**
 * Generates the metainfo.xml based on the template provided by the user.
 */
function generateMetaInfo(name: string, trackCount: number) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<MetaInformation>
	<Attribute id="Document:Title" value="${escapeXml(name)}"/>
	<Attribute id="Document:Generator" value="Studio Pro/8.0.0.110141"/>
	<Attribute id="Document:Creator" value="SonicCritique AI"/>
	<Attribute id="Media:SampleRate" value="44100"/>
	<Attribute id="Media:Tempo" value="120"/>
	<Attribute id="Media:TrackCount" value="${trackCount}"/>
	<Attribute id="Media:BitDepth" value="32"/>
	<Attribute id="Document:FormatVersion" value="9"/>
	<Attribute id="Document:MimeType" value="application/x.presonus-song"/>
</MetaInformation>`;
}

/**
 * Generates the mediapool.xml to register the uploaded audio file correctly.
 */
function generateMediaPool(audioFileName: string, mediaGuid: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<MediaPool>
	<Attributes x:id="rootFolder">
		<MediaFolder name="Audio">
			<AudioClip mediaID="${mediaGuid}">
				<Url x:id="path" type="1" url="media:///Media/${escapeXml(audioFileName)}"/>
				<AudioTempoMap x:id="tempoMap" tempoApproved="1"/>
				<Attributes x:id="format" sampleRate="44100" numChannels="2" bitDepth="24"/>
			</AudioClip>
		</MediaFolder>
	</Attributes>
</MediaPool>`;
}

/**
 * Generates the song.xml based on the user's template and AI blueprint.
 * Uses the complex nested structure seen in the provided templates.
 */
function generateSongMainXml(blueprint: SessionBlueprint, mediaGuid: string, trackGuids: string[]) {
  const tracksXml = blueprint.tracks.map((track, i) => {
    const trackId = trackGuids[i];
    const channelId = generateGuid();
    const color = track.type === 'fx' ? 'FF9B59B6' : (track.type === 'bus' ? 'FFE67E22' : 'FF3498DB');

    return `
			<MediaTrack mediaType="Audio" tempoFollow="2" trackNumber="${i + 1}" version="1" trackID="${trackId}" timeFormat="2" name="${escapeXml(track.name)}" color="${color}">
				<SpeakerSetup x:id="trackFormat" type="Stereo"/>
				<UID x:id="channelID" uid="${channelId}"/>
        <Attributes x:id="attributes" height="60"/>
        ${track.inserts && track.inserts.length > 0 ? `
        <InsertList>
          ${track.inserts.map((p) => `<Plugin name="${escapeXml(p.name)}" id="${generateGuid()}" active="1" />`).join('')}
        </InsertList>` : ''}
			</MediaTrack>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Song popup="0" copyrighted="0" masterWithEffects="1">
	<Attributes x:id="Root" defaultTimeFormat="2" stretch="1" envelopeVisibility="1" timeFormat="0" length="300">
		<Attributes x:id="timeContext" sampleRate="44100" frameType="1" frameOffset="0" timeOffset="0" barOffset="0">
			<TempoMap x:id="tempoMap">
				<TempoMapSegment curveType="0" start="0" end="1.7976931348623156e+200" tempo="0.5"/>
			</TempoMap>
			<TimeSignatureMap x:id="timeSignatureMap">
				<TimeSignatureMapSegment start="0" numerator="4" denominator="4" type="0"/>
			</TimeSignatureMap>
		</Attributes>
		<List x:id="Tracks">
			<MarkerTrack version="1" trackID="${generateGuid()}" timeFormat="2">
				<MarkerEvent markerStop="0" markerType="2" start="0" name="Start"/>
			</MarkerTrack>
			${tracksXml}
		</List>
	</Attributes>
</Song>`;
}

export function exportTextBlueprint(blueprint: SessionBlueprint): string {
  let text = "--- STUDIO ONE SESSION BLUEPRINT ---\n\n";
  
  text += "TRACKS:\n";
  blueprint.tracks.forEach(track => {
    text += `  [${track.type.toUpperCase()}] ${track.name}\n`;
    if (track.inserts && track.inserts.length > 0) {
      text += `    Inserts:\n`;
      track.inserts.forEach(plugin => {
        text += `      - ${plugin.name}\n`;
        plugin.settings?.forEach(setting => {
          text += `          * ${setting}\n`;
        });
      });
    }
    if (track.sends && track.sends.length > 0) {
      text += `    Sends:\n`;
      track.sends.forEach(send => {
        text += `      -> ${send.target} (${send.level}dB)\n`;
      });
    }
    text += "\n";
  });
  
  text += "MASTER BUS:\n";
  if (blueprint.masterBus?.inserts && blueprint.masterBus.inserts.length > 0) {
    blueprint.masterBus.inserts.forEach(plugin => {
      text += `  - ${plugin.name}\n`;
      plugin.settings?.forEach(setting => {
        text += `      * ${setting}\n`;
      });
    });
  } else {
    text += "  (None)\n";
  }
  
  return text;
}

/**
 * Main export to create the Studio One .song archive.
 */
export async function createStudioOneSession(
  name: string, 
  blueprint: SessionBlueprint, 
  audioBlob: Blob,
  audioFileName: string
): Promise<Blob> {
  const zip = new JSZip();
  const mediaGuid = generateGuid();
  const trackGuids = blueprint.tracks.map(() => generateGuid());

  // Root Files
  zip.file('metainfo.xml', generateMetaInfo(name, blueprint.tracks.length));
  zip.file('song.xml', generateSongMainXml(blueprint, mediaGuid, trackGuids));
  zip.file('notepad.xml', `<?xml version="1.0" encoding="UTF-8"?><NotepadData></NotepadData>`);
  zip.file('notes.txt', `Generated by SonicCritique AI.\nAudio: ${audioFileName}`);

  // Subfolder 'song'
  const songFolder = zip.folder('song');
  if (songFolder) {
    songFolder.file('mediapool.xml', generateMediaPool(audioFileName, mediaGuid));
    songFolder.file('settings.xml', `<?xml version="1.0" encoding="UTF-8"?><Settings version="1"></Settings>`);
    songFolder.file('editor.xml', `<?xml version="1.0" encoding="UTF-8"?><SongEditor></SongEditor>`);
  }

  // Media folder
  const mediaFolder = zip.folder('Media');
  if (mediaFolder) {
    mediaFolder.file(audioFileName, audioBlob);
  }

  // Placeholder folders
  zip.folder('Devices');
  zip.folder('History');
  zip.folder('Cache');

  return await zip.generateAsync({ 
    type: 'blob',
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}