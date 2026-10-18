# Visual UI/UX/functions

## Funtions/Dock

### Assignments (A)
- Add assignment
- Assignments list
    - Start assignment
    - Edit assignment
    - Dublicate assignment

[Add/Edit/Dublicate assignment]
    - Name
    - Instructions
    - Start date
    - Finish date
    - Camera preset
    - Needed photos *count*
    - Participants
        - Choose Тeam
            - ID list + Roles
        - Create Team
        [Create/Edit Team]
            - You Owner
            - Add
            [Add/Edit Participant]
                - ID
                - Role
                - Send assignment to participant?
    - Contributors rules
        - Category is required
            - Paticular category?
                - Categories list
        - Description is required
            - Min leingh (10 simbols)
        - Chaneging is allowed
            - Ceep original?
        - Removing is allowed (Deleting)?
        - Viewing assignment gallery is allowed?
            - Only thumbneils (80x80px)
        - Sharing assignment photos is allowed?
            - Only between the participants

### Messages (M)
- Chats

### Take Photo (P)

- Camera
    - Category
        - Choose category
            - Categories list
                - Select category
                - Delete/Edit category
    - Camera settings
        - Choose preset
            - Presets list
                - Dublicate preset
                - Archive/Delete
                - Edit preset

[Camera settings/Add/Edit/Dublicate preset]
    - name (auto: prodfile number)
    - description (not nessesary)
    - resolution
        - Max
        - High
        - Medium
        - Low
        - Custom
    - Ratio
        - 1:1
        - 4:3
        - 3:2
        - 16:9
        - Custom
    - Metadata
        - Date
        - Time
        - Camera information
        - Geo
    - auto-delete photos after
        - No delete
        - 1 hour
        - 3 hours
        - 12 hours
        - 24 hours
        - 5 days
        - 7 days
        - 14 days
        - 21 days
        - 30 days
        - custom

### Gallery (G)
- Filter
- Photos list
    - View photo
    - Edit photo
    - Delete photo
    - Share photo

[View photo]
    - Photo
    - Category, Description, Date of living (deleting date)
    - Metadata
    - Geo map / Coordinates

### Profile/Settings (S)
- My Account
    - InAppID (for Teams)
    - Username (@blablabla)(not necessary)
    - Name (not necessary)
    - Email (not necessary)
    - Phone number (not necessary)
    - Links (not necessary)
    - About (not necessary)
- Apirience
    - Theme
        - Auto (device theme)
        - Auto (time theme)
        - Dark
        - Light
    - language
        - English
        - Russian
        - Ukrain
        - Polski
        - Turkiy
- Privacy
- Security
    - Pin code
    - ...and so on
    - Wrapper (explane late)
- Infrastructure
    - Matrix server
    - S3 Server
- Contact/Report
- About

## UI

### Dock
```
-------------------------------
|  A  |  M  |  P  |  G  |  S  |
-------------------------------
```

### Profiles
```
--------------------------------
| Logo | Camera->Profiles  [+] |
|                              |
|  -------------------------   |
|  | profile #1          : |   |
|  |                       |   |
|  -------------------------   |
|  -------------------------   |
|  | profile #2          : |   |
|  |                       |   |
|  -------------------------   |
|  -------------------------   |
|  | profile #3          : |   |
|  |                       |   |
|  -------------------------   |
|                              |
|-------------------------------
|            dock              |
--------------------------------
```

### Assignments
```
--------------------------------
| pb | Assignments      [+][s] |
|                              |
|  -------------------------   |
|  | assignment #1       : |   |
|  |                       |   |
|  -------------------------   |
|  -------------------------   |
|  | assignment #2       : |   |
|  |                       |   |
|  -------------------------   |
|  -------------------------   |
|  | assignment #3       : |   |
|  |                       |   |
|  -------------------------   |
|                              |
|-------------------------------
|            dock              |
--------------------------------
s - search
```

### Gallery
```
--------------------------------
| pb | Gallery        [Filter] |
|                              |
|   ----------   -----------   |
|  | Photo #1 | | Photo #2  |  |
|  |          | |           |  |
|   ----------   -----------   |
|   ----------   -----------   |
|  | Photo #3 | | Photo #4  |  |
|  |          | |           |  |
|   ----------   -----------   |
|   ----------   -----------   |
|  | Photo #5 | | Photo #6  |  |
|  |          | |           |  |
|   ----------   -----------   |
|                              |
|-------------------------------
|            dock              |
--------------------------------
```

### Camera
```
--------------------------------
| pb | Camera        [Filter] |
|                              |
|   ------------------------   |
|  |                        |  |
|  |                        |  |
|  |                        |  |
|  |                        |  |
|  |        camera          |  |
|  |                        |  |
|  |                        |  |
|  |                        |  |
|  |                        |  |
|   ----------   -----------   |
|            -----             |
|   profile |     | Category   |
|            -----             |
|-------------------------------
|            dock              |
--------------------------------
```

### Welcome page
```
--------------------------------
|         photobunker          |
|                              |
|  -------------------------   |
|  |   Create New Account  |   |
|  |     *anonymously*     |   |
|  -------------------------   |
|  -------------------------   |
|  |    Recover Account    |   |
|  |   *if you have key*   |   |
|  -------------------------   |
|  -------------------------   |
|  |    Why photobunker?   |   |
|  |                       |   |
|  |  < bla bla bla bla  > |   |
|  |                       |   |
|  |         . . .         |   |
|  -------------------------   |
|                              |
--------------------------------
Why photobunker: autoscrolling + manualscrolling.
```

### Header example
```
----------------------------------------------------------
|       |                            |        | |        |
| logo. |                            | :edit: | | :plus: |
|-------|                            |--------| |--------|
|                                                        |
Шапка прозрачная (точнее пустая) - логотип кружочком и кнопки кружочком сверху как отдельные элементы.
```