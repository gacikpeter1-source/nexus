/**
 * Club/team logo upload — resizes the image client-side (keeps uploads small
 * and consistent for both the circle-avatar and card-background display
 * styles), uploads via the generic media storage service, then writes the
 * resulting download URL onto the club/team document.
 */
import { generateThumbnail, validateFile, uploadFile } from './storage';
import { updateClub, updateTeam } from './clubs';

const LOGO_MAX_DIMENSION = 512;
const LOGO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function uploadLogoImage(
  file: File,
  options: { category: 'club' | 'team'; clubId: string; teamId?: string }
): Promise<string> {
  const validation = validateFile(file, { maxSizeMB: 8, allowedTypes: LOGO_ALLOWED_TYPES });
  if (!validation.valid) throw new Error(validation.error);

  const thumbnail = await generateThumbnail(file, LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION);
  const resizedFile = new File([thumbnail], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });

  const { downloadUrl } = await uploadFile(resizedFile, {
    category: options.category,
    clubId: options.clubId,
    teamId: options.teamId,
  });
  return downloadUrl;
}

export async function uploadClubLogo(clubId: string, file: File): Promise<string> {
  const downloadUrl = await uploadLogoImage(file, { category: 'club', clubId });
  await updateClub(clubId, { logoURL: downloadUrl });
  return downloadUrl;
}

export async function uploadTeamLogo(clubId: string, teamId: string, file: File): Promise<string> {
  const downloadUrl = await uploadLogoImage(file, { category: 'team', clubId, teamId });
  await updateTeam(clubId, teamId, { logoURL: downloadUrl });
  return downloadUrl;
}
