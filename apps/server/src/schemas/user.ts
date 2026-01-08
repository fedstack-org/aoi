import { T, Static } from './common.js'

export const SUserProfile = T.StrictObject({
  name: T.String({ maxLength: 16 }),
  email: T.String({ maxLength: 128, pattern: '^\\S+@\\S+$' }),
  realname: T.String({ maxLength: 16 }),
  telephone: T.Optional(T.String({ pattern: '^\\d{11}$' })),
  school: T.Optional(T.String({ maxLength: 32 })),
  studentGrade: T.Optional(T.String({ maxLength: 32 })),
  verified: T.Optional(T.Array(T.String()))
})

export interface IUserProfile extends Static<typeof SUserProfile> {}
