import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from '../../common/dto-helpers';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria' })
  @MaxLength(72)
  currentPassword!: string;

  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}
